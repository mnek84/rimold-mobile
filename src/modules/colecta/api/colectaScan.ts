import axios from 'axios';

import { apiClient } from '@core/api';

/**
 * Reasons a colecta scan can be invalid. Mirrors backend
 * `App\Domains\Collections\Actions\ValidateColectaScanResult::REASON_*`.
 *
 * `network` is mobile-only: surfaced when the request itself failed (offline / timeout / 5xx).
 */
export type ColectaScanInvalidReason =
  | 'not_found'
  | 'wrong_business'
  | 'invalid_status'
  | 'sender_not_authorized'
  | 'network';

export type ColectaScanSourceKind = 'existing' | 'flex_stub';

export type ColectaScanValidationOk = {
  valid: true;
  source: ColectaScanSourceKind;
  trackingId: string;
  externalRef: string | null;
  executionType: string | null;
  businessId: string | null;
  warehouseId: string | null;
  status: string | null;
};

export type ColectaScanValidationFail = {
  valid: false;
  reason: ColectaScanInvalidReason;
  mlSenderId?: number;
  currentStatus?: string;
};

export type ColectaScanValidationResult = ColectaScanValidationOk | ColectaScanValidationFail;

type RawShipment = {
  trackingId?: unknown;
  externalRef?: unknown;
  executionType?: unknown;
  businessId?: unknown;
  warehouseId?: unknown;
  status?: unknown;
};

type RawScanResponse = {
  valid?: unknown;
  source?: unknown;
  shipment?: unknown;
  reason?: unknown;
  mlSenderId?: unknown;
  currentStatus?: unknown;
};

function stringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function parseOkResponse(data: RawScanResponse): ColectaScanValidationOk | null {
  const source = data.source;
  if (source !== 'existing' && source !== 'flex_stub') return null;

  const shipment = data.shipment;
  if (shipment === null || typeof shipment !== 'object') return null;
  const s = shipment as RawShipment;

  const trackingId = stringOrNull(s.trackingId);
  if (trackingId === null) return null;

  return {
    valid: true,
    source,
    trackingId,
    externalRef: stringOrNull(s.externalRef),
    executionType: stringOrNull(s.executionType),
    businessId: stringOrNull(s.businessId),
    warehouseId: stringOrNull(s.warehouseId),
    status: stringOrNull(s.status),
  };
}

function parseFailResponse(data: RawScanResponse): ColectaScanValidationFail {
  const reasonRaw = typeof data.reason === 'string' ? data.reason : '';
  const reason: ColectaScanInvalidReason =
    reasonRaw === 'not_found' ||
    reasonRaw === 'wrong_business' ||
    reasonRaw === 'invalid_status' ||
    reasonRaw === 'sender_not_authorized'
      ? reasonRaw
      : 'not_found';

  const out: ColectaScanValidationFail = { valid: false, reason };
  if (typeof data.mlSenderId === 'number' && Number.isFinite(data.mlSenderId)) {
    out.mlSenderId = data.mlSenderId;
  }
  const currentStatus = stringOrNull(data.currentStatus);
  if (currentStatus !== null) {
    out.currentStatus = currentStatus;
  }
  return out;
}

export type ValidateColectaScanInput = {
  raw: string;
  collectionId: string;
  businessId: string;
  warehouseId: string;
  signal?: AbortSignal;
};

/**
 * Real-time colecta scan validation: ask the backend whether a scanned package is valid
 * for the current colecta session and resolve it to the canonical internal tracking.
 *
 * Backend: `POST /v1/mobile/colecta/scan` ({@see ValidateScanController}).
 */
export async function validateColectaScan(
  input: ValidateColectaScanInput,
): Promise<ColectaScanValidationResult> {
  try {
    const { data } = await apiClient.post<RawScanResponse>(
      '/colecta/scan',
      {
        raw: input.raw,
        collectionId: input.collectionId,
        businessId: input.businessId,
        warehouseId: input.warehouseId,
      },
      { signal: input.signal },
    );

    if (data?.valid === true) {
      const parsed = parseOkResponse(data);
      if (parsed !== null) return parsed;
      return { valid: false, reason: 'not_found' };
    }

    return parseFailResponse(data ?? {});
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const body = error.response?.data as RawScanResponse | undefined;
      if (status === 404 || status === 422) {
        return parseFailResponse(body ?? {});
      }
    }
    return { valid: false, reason: 'network' };
  }
}
