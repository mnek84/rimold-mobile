import { parseQrPayload } from './parseQrPayload';

/**
 * Convierte un QR / texto de envío al valor que usamos para APIs y estado local:
 * - QR JSON MercadoLibre Flex (`id` + `sender_id` + …) → `id`
 * - `LGST1:` (JSON Base64) → tracking embebido (`t`)
 * - `TRK_…` → sufijo sin prefijo (mismo criterio que {@link parseQrPayload})
 * - Cualquier otro string → sin cambios (tracking, ref. cliente, ref. paquete, etc.)
 */
export function normalizeShipmentScanToLookupKey(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return '';
  }
  const p = parseQrPayload(trimmed);
  if (p.type === 'mercadolibre') {
    return p.trackingId.trim();
  }
  if (p.type === 'internal' && p.trackingId != null && p.trackingId.trim() !== '') {
    return p.trackingId.trim();
  }
  return trimmed;
}
