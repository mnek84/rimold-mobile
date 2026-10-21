/**
 * Número de envío pelado: la etiqueta Flex actual trae sólo eso en el QR.
 *
 * Hoy ML emite 11 dígitos; las cotas son anchas para sobrevivir un cambio de largo y angostas
 * para no pisar referencias numéricas cortas de clientes. Debe coincidir con
 * `ScanPayloadClassifier::ML_SHIPMENT_NUMBER` en el backend.
 */
const ML_SHIPMENT_NUMBER = /^\d{8,20}$/;

export function isMercadoLibreShipmentNumber(raw: string): boolean {
  return ML_SHIPMENT_NUMBER.test(raw.trim());
}

export function parseMercadoLibreQR(raw: string): { id: string; sender_id: number } | null {
  try {
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed[0] !== '{') {
      return null;
    }
    const data = JSON.parse(trimmed) as unknown;
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      return null;
    }
    const o = data as Record<string, unknown>;
    const id = o.id;
    const sender_id = o.sender_id;
    const hash_code = o.hash_code;
    const security_digit = o.security_digit;

    if (typeof id !== 'string' || !/^\d+$/.test(id)) {
      return null;
    }
    if (typeof sender_id !== 'number' || !Number.isFinite(sender_id)) {
      return null;
    }
    if (typeof hash_code !== 'string' || hash_code.length <= 10) {
      return null;
    }
    if (typeof security_digit !== 'number' && typeof security_digit !== 'string') {
      return null;
    }
    if (typeof security_digit === 'string' && security_digit.trim() === '') {
      return null;
    }

    return { id, sender_id };
  } catch {
    return null;
  }
}
