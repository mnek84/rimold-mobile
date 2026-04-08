import type { AuthRole, AuthUser } from '@core/auth/types';
import { getLinkedDeviceId } from '@core/device/linkedDeviceId';
import { isAxiosError } from 'axios';

import { apiClient } from './client';

type LoginRequest = {
  email: string;
  password: string;
};

type QrLoginRequest = {
  employee_id: string;
  secret: string;
};

function pickDisplayName(raw: Record<string, unknown>): string | undefined {
  const n = raw.name;
  if (typeof n === 'string' && n.trim() !== '') return n.trim();
  return undefined;
}

function mapRolesToAuthRole(roles: string[]): AuthRole {
  const lower = roles.map((r) => r.toLowerCase());
  if (lower.includes('warehouse_operator') || lower.includes('warehouse')) {
    return 'WAREHOUSE';
  }
  return 'DRIVER';
}

function normalizeUser(raw: unknown): AuthUser | null {
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = o.id;
  if (id === undefined || id === null) return null;

  if (o.type === 'employee') {
    const name = pickDisplayName(o);
    const roles = o.roles;
    const role: AuthRole =
      Array.isArray(roles) && roles.length > 0 && roles.every((r) => typeof r === 'string')
        ? mapRolesToAuthRole(roles)
        : 'DRIVER';
    return name !== undefined ? { id: String(id), role, name } : { id: String(id), role };
  }

  if (o.role === 'DRIVER' || o.role === 'WAREHOUSE') {
    const name = pickDisplayName(o);
    return name !== undefined ? { id: String(id), role: o.role, name } : { id: String(id), role: o.role };
  }

  const roles = o.roles;
  if (Array.isArray(roles) && roles.every((r) => typeof r === 'string')) {
    const name = pickDisplayName(o);
    const base = { id: String(id), role: mapRolesToAuthRole(roles) };
    return name !== undefined ? { ...base, name } : base;
  }

  return null;
}

/** Message from API error body or fallback (for login / QR login). */
export function getAuthErrorMessage(e: unknown, fallback: string): string {
  if (isAxiosError(e)) {
    const d = e.response?.data;
    if (d !== null && typeof d === 'object' && 'message' in d) {
      const m = (d as { message: unknown }).message;
      if (typeof m === 'string' && m !== '') return m;
    }
  }
  if (e instanceof Error && e.message !== '') return e.message;
  return fallback;
}

function pickToken(data: Record<string, unknown>): string | null {
  if (typeof data.token === 'string' && data.token !== '') return data.token;
  if (typeof data.access_token === 'string' && data.access_token !== '') return data.access_token;
  return null;
}

async function fetchMe(token: string): Promise<AuthUser> {
  const { data } = await apiClient.get<Record<string, unknown>>('/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const user = normalizeUser(data);
  if (user === null) {
    throw new Error('Invalid user payload');
  }
  return user;
}

/** Current session profile (`/auth/me`). Uses the stored bearer token. */
export async function refreshSessionUser(): Promise<AuthUser> {
  const { data } = await apiClient.get<Record<string, unknown>>('/auth/me');
  const user = normalizeUser(data);
  if (user === null) {
    throw new Error('Invalid user payload');
  }
  return user;
}

export async function login(request: LoginRequest): Promise<{ token: string; user: AuthUser }> {
  const { data } = await apiClient.post<Record<string, unknown>>('/auth/login', request);
  const token = pickToken(data);
  if (token === null) {
    throw new Error('Invalid login response');
  }

  let user = normalizeUser(data.user);
  if (user === null) {
    user = await fetchMe(token);
  }

  return { token, user };
}

/**
 * Mobile app only: employee sign-in via `POST /auth/login/qr`.
 * Not used by admin or other web clients; same JWT shape as email/password.
 */
export async function loginWithQr(request: QrLoginRequest): Promise<{ token: string; user: AuthUser }> {
  const device_id = await getLinkedDeviceId();
  const { data } = await apiClient.post<Record<string, unknown>>('/auth/login/qr', {
    ...request,
    device_id,
  });
  const token = pickToken(data);
  if (token === null) {
    throw new Error('Invalid login response');
  }

  let user = normalizeUser(data.employee);
  if (user === null) {
    user = await fetchMe(token);
  }

  return { token, user };
}
