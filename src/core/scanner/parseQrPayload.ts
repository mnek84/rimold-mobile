import { parseMercadoLibreQR } from './parseMercadoLibreQR';
import type { ScannerParseResult } from './types';

export const INTERNAL_QR_PREFIX = 'TRK_' as const;

/** Must match backend `ShipmentQrPayload::PREFIX`. */
export const SHIPMENT_QR_PREFIX = 'LGST1:' as const;

function base64UrlToUtf8(b64url: string): string | null {
  try {
    const pad = b64url.length % 4 === 0 ? '' : '='.repeat(4 - (b64url.length % 4));
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + pad;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function tryDecodeShipmentQrTracking(trimmed: string): string | null {
  if (!trimmed.startsWith(SHIPMENT_QR_PREFIX)) {
    return null;
  }
  const json = base64UrlToUtf8(trimmed.slice(SHIPMENT_QR_PREFIX.length));
  if (json == null) {
    return null;
  }
  try {
    const data = JSON.parse(json) as unknown;
    if (data === null || typeof data !== 'object' || !('t' in data)) {
      return null;
    }
    const t = (data as { t?: unknown }).t;
    if (typeof t !== 'string') {
      return null;
    }
    const id = t.trim();
    return id !== '' ? id : null;
  } catch {
    return null;
  }
}

/**
 * Classify a scanned QR string. LGST1 payloads decode to internal tracking (`t`).
 * Legacy internal codes start with `TRK_`; the tracking id is the remainder.
 */
export function parseQrPayload(raw: string): ScannerParseResult {
  const trimmed = raw.trim();

  const ml = parseMercadoLibreQR(trimmed);
  if (ml !== null) {
    return {
      raw: trimmed,
      type: 'mercadolibre',
      trackingId: ml.id,
      clientId: ml.sender_id,
    };
  }

  const fromLgst = tryDecodeShipmentQrTracking(trimmed);
  if (fromLgst !== null) {
    return {
      raw: trimmed,
      type: 'internal',
      trackingId: fromLgst,
    };
  }

  if (trimmed.startsWith(INTERNAL_QR_PREFIX)) {
    return {
      raw: trimmed,
      type: 'internal',
      trackingId: trimmed.slice(INTERNAL_QR_PREFIX.length),
    };
  }

  return {
    raw: trimmed,
    type: 'external',
    trackingId: null,
  };
}
