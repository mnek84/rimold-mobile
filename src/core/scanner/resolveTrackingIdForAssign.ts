import axios from 'axios';

import { resolveExternalQR } from '@core/api/scan';

import { INTERNAL_QR_PREFIX, parseQrPayload, SHIPMENT_QR_PREFIX } from './parseQrPayload';
import { normalizeShipmentScanToLookupKey } from './normalizeShipmentScan';

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

  const tryResolve = async (value: string): Promise<string | null> => {
    try {
      const { tracking_id } = await resolveExternalQR(value);
      const t = tracking_id.trim();
      return t !== '' ? t : null;
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
