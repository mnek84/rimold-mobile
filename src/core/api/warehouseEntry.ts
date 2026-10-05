import axios from 'axios';

import { apiClient } from './client';

export type WarehouseEntryScanReason =
  | 'not_found'
  | 'invalid_qr'
  | 'invalid_state'
  | 'network'
  | 'unknown';

/** Progreso por bulto del envío en este hito, tal como lo informa el backend. */
export type WarehouseEntryPackages = {
  scanned: number;
  total: number;
  complete: boolean;
  /** Códigos de bulto que todavía no ingresaron. */
  missing: string[];
  /** Bulto que resolvió este escaneo; null si el código no identifica uno. */
  package: { id: string; code: string; sequence: number; totalPackages: number } | null;
  /** True cuando el escaneo no identificó un bulto y se marcaron todos. */
  ambiguous: boolean;
};

export type WarehouseEntryScanSuccess = {
  valid: true;
  duplicate: boolean;
  shipment: { id: string; tracking: string; status: string };
  /** Ausente si el backend todavía no expone el progreso por bulto. */
  packages: WarehouseEntryPackages | null;
};

export type WarehouseEntryScanFailure = {
  valid: false;
  reason: WarehouseEntryScanReason;
  currentStatus?: string;
  message?: string;
};

export type WarehouseEntryScanResult = WarehouseEntryScanSuccess | WarehouseEntryScanFailure;

function parseSuccess(payload: unknown): WarehouseEntryScanSuccess | null {
  if (payload === null || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (p.valid !== true) return null;
  const ship = p.shipment as Record<string, unknown> | undefined;
  if (ship == null || typeof ship.id !== 'string' || typeof ship.tracking !== 'string' || typeof ship.status !== 'string') {
    return null;
  }
  return {
    valid: true,
    duplicate: Boolean(p.duplicate),
    shipment: { id: ship.id, tracking: ship.tracking, status: ship.status },
    packages: parsePackages(p.packages),
  };
}

function positiveIntOr(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

/** Degrada a null contra backends anteriores, sin romper el escaneo. */
function parsePackages(value: unknown): WarehouseEntryPackages | null {
  if (value === null || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.total !== 'number') return null;

  const pkg = v.package;
  let parsedPackage: WarehouseEntryPackages['package'] = null;
  if (pkg !== null && typeof pkg === 'object') {
    const q = pkg as Record<string, unknown>;
    if (typeof q.id === 'string' && typeof q.code === 'string') {
      parsedPackage = {
        id: q.id,
        code: q.code,
        sequence: positiveIntOr(q.sequence, 1),
        totalPackages: positiveIntOr(q.total_packages, 1),
      };
    }
  }

  return {
    scanned: positiveIntOr(v.scanned, 0),
    total: positiveIntOr(v.total, 1),
    complete: v.complete === true,
    missing: Array.isArray(v.missing) ? v.missing.filter((m): m is string => typeof m === 'string') : [],
    package: parsedPackage,
    ambiguous: v.ambiguous === true,
  };
}

function parseFailureBody(body: unknown, fallbackReason: WarehouseEntryScanReason): WarehouseEntryScanFailure {
  if (body === null || typeof body !== 'object') {
    return { valid: false, reason: fallbackReason };
  }
  const b = body as Record<string, unknown>;
  const rawReason = typeof b.reason === 'string' ? b.reason : fallbackReason;
  const reason: WarehouseEntryScanReason =
    rawReason === 'not_found' || rawReason === 'invalid_qr' || rawReason === 'invalid_state'
      ? rawReason
      : fallbackReason;

  return {
    valid: false,
    reason,
    currentStatus: typeof b.current_status === 'string' ? b.current_status : undefined,
    message: typeof b.message === 'string' ? b.message : undefined,
  };
}

/**
 * Escanea un envío ya colectado para marcarlo como ingresado al depósito. Idempotente:
 * si ya está en `in_warehouse` retorna `duplicate: true` sin error.
 */
export async function warehouseEntryScan(raw: string): Promise<WarehouseEntryScanResult> {
  try {
    const { data } = await apiClient.post<unknown>('/app/warehouse/entry/scan', { raw: raw.trim() });
    const ok = parseSuccess(data);
    if (ok !== null) return ok;
    return parseFailureBody(data, 'unknown');
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const body = error.response?.data;
      if (status === 404) return parseFailureBody(body, 'not_found');
      if (status === 422) return parseFailureBody(body, 'invalid_state');
    }
    return { valid: false, reason: 'network' };
  }
}
