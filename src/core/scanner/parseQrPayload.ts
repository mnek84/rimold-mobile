import { parseMercadoLibreQR } from './parseMercadoLibreQR';
import type { ScannedPackage, ScannerParseResult } from './types';

export const INTERNAL_QR_PREFIX = 'TRK_' as const;

/** Must match backend `ShipmentQrPayload::PREFIX`. */
export const SHIPMENT_QR_PREFIX = 'LGST1:' as const;

type ShipmentQrPayload = {
  tracking: string;
  reference: string | null;
  package: ScannedPackage | null;
};

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

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed !== '' ? trimmed : null;
}

function asPositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

/**
 * Decodifica el payload `LGST1:` completo.
 *
 * Además del tracking (`t`), lee la identidad del bulto (`p` / `pid`) y su
 * posición (`n` / `nt`). Antes esta función devolvía sólo `t`, por lo que los 4
 * bultos de un envío eran indistinguibles entre sí al escanear.
 */
function tryDecodeShipmentQr(trimmed: string): ShipmentQrPayload | null {
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
    const d = data as Record<string, unknown>;
    const tracking = asTrimmedString(d.t);
    if (tracking == null) {
      return null;
    }

    const code = asTrimmedString(d.p);
    const index = asPositiveInt(d.n, 1);
    const total = asPositiveInt(d.nt, 1);

    return {
      tracking,
      reference: asTrimmedString(d.r),
      // Sin `p` no hay identidad de bulto: etiqueta impresa antes del cambio.
      package: code == null ? null : { code, id: asTrimmedString(d.pid), index, total },
    };
  } catch {
    return null;
  }
}

/**
 * Classify a scanned QR string. LGST1 payloads decode to internal tracking (`t`)
 * plus, when present, the physical bulto they identify (`p`).
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
      reference: null,
      package: null,
    };
  }

  const fromLgst = tryDecodeShipmentQr(trimmed);
  if (fromLgst !== null) {
    return {
      raw: trimmed,
      type: 'internal',
      trackingId: fromLgst.tracking,
      reference: fromLgst.reference,
      package: fromLgst.package,
    };
  }

  if (trimmed.startsWith(INTERNAL_QR_PREFIX)) {
    return {
      raw: trimmed,
      type: 'internal',
      trackingId: trimmed.slice(INTERNAL_QR_PREFIX.length),
      reference: null,
      package: null,
    };
  }

  return {
    raw: trimmed,
    type: 'external',
    trackingId: null,
    reference: null,
    package: null,
  };
}
