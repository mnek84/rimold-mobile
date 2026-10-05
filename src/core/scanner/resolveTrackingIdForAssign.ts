import axios from 'axios';

import { resolveExternalQR } from '@core/api/scan';

import { INTERNAL_QR_PREFIX, parseQrPayload, SHIPMENT_QR_PREFIX } from './parseQrPayload';
import { normalizeShipmentScanToLookupKey } from './normalizeShipmentScan';

/**
 * Cuántos bultos tiene el envío que se acaba de escanear, cuando el backend lo
 * informa. Sirve para avisarle al chofer que ese envío son N piezas físicas.
 */
export type AssignScanPackageInfo = {
  total: number;
  sequence: number | null;
  code: string | null;
};

let lastPackageInfo: AssignScanPackageInfo | null = null;

/** Info de bulto del último {@link resolveTrackingIdForAssign} resuelto por API. */
export function takeLastAssignPackageInfo(): AssignScanPackageInfo | null {
  const info = lastPackageInfo;
  lastPackageInfo = null;
  return info;
}

/**
 * Maps a raw QR / barcode string to the canonical `tracking` value used by the API,
 * using the same resolution rules as POST /scan/resolve where possible.
 * LGST1 QRs se interpretan en cliente (tracking en `t`) y se resuelven contra la API.
 */
export async function resolveTrackingIdForAssign(raw: string): Promise<string> {
  const trimmed = raw.trim();
  if (trimmed === '') {
    throw new Error('Código vacío.');
  }

  const lookupKey = normalizeShipmentScanToLookupKey(trimmed);

  lastPackageInfo = null;

  const tryResolve = async (value: string): Promise<string | null> => {
    try {
      const res = await resolveExternalQR(value);
      const t = res.tracking_id.trim();
      if (t === '') return null;
      const total = typeof res.package_total === 'number' ? res.package_total : null;
      if (total != null && total > 1) {
        lastPackageInfo = {
          total,
          sequence: typeof res.package_sequence === 'number' ? res.package_sequence : null,
          code: typeof res.package_code === 'string' ? res.package_code : null,
        };
      }
      return t;
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 404) {
        return null;
      }
      throw e;
    }
  };

  try {
    const fromRaw = await tryResolve(trimmed);
    if (fromRaw != null) {
      return fromRaw;
    }
    if (lookupKey !== trimmed) {
      const fromKey = await tryResolve(lookupKey);
      if (fromKey != null) {
        return fromKey;
      }
    }
  } catch (e) {
    if (
      axios.isAxiosError(e) &&
      (e.code === 'ERR_NETWORK' || e.response == null) &&
      trimmed.startsWith(SHIPMENT_QR_PREFIX) &&
      lookupKey !== trimmed
    ) {
      return lookupKey;
    }
    throw e;
  }

  const parsed = parseQrPayload(trimmed);
  const internalTracking =
    parsed.type === 'mercadolibre'
      ? parsed.trackingId
      : parsed.type === 'internal' && parsed.trackingId != null && parsed.trackingId !== ''
        ? parsed.trackingId
        : null;
  if (internalTracking != null) {
    const viaFull = await tryResolve(`${INTERNAL_QR_PREFIX}${internalTracking}`);
    if (viaFull != null) {
      return viaFull;
    }
    const viaSuffix = await tryResolve(internalTracking);
    if (viaSuffix != null) {
      return viaSuffix;
    }
    return internalTracking;
  }

  return lookupKey;
}
