/**
 * Identidad del bulto físico embebida en el QR de la etiqueta.
 *
 * Viene de las claves `p` / `pid` / `n` / `nt` del payload `LGST1:`, o de
 * `bulk` / `bulks` en el QR viejo `{"id","bulk","bulks"}` (el código se arma
 * como `{tracking}-{NN}`, igual que en el backend). Es `null` cuando el código
 * no identifica un bulto concreto: un tracking tipeado a mano. En ese caso el
 * flujo sigue tratando al envío como una unidad, igual que antes.
 */
export type ScannedPackage = {
  /** Identificador único y permanente, ej. "KQX042-03". */
  code: string;
  /** UUID del bulto en el backend, cuando el QR lo trae. */
  id: string | null;
  /** Posición dentro del envío (1-based). */
  index: number;
  /** Cantidad total de bultos del envío. */
  total: number;
};

/** Parsed QR payload after applying internal vs external rules. */
export type ScannerParseResult =
  | {
      raw: string;
      type: 'internal';
      trackingId: string | null;
      /** Referencia del cliente embebida en el QR (`r`), si la trae. */
      reference: string | null;
      package: ScannedPackage | null;
    }
  | {
      raw: string;
      type: 'external';
      trackingId: null;
      reference: null;
      package: null;
    }
  | {
      raw: string;
      type: 'mercadolibre';
      trackingId: string;
      /**
       * `sender_id` del vendedor, cuando el QR lo trae. La etiqueta Flex actual es sólo el
       * número de envío, así que acá viene `null` y el backend resuelve el sender contra ML.
       */
      clientId: number | null;
      /** Cómo se reconoció la etiqueta. Debe coincidir con `ScanPayloadClassification::ML_FORMAT_*`. */
      mlFormat: 'flex_json' | 'shipment_number';
      reference: null;
      package: null;
    };

/**
 * Clave de deduplicación de un escaneo.
 *
 * Con multi-bulto el tracking ya no alcanza: los 4 bultos de un envío comparten
 * tracking, así que deduplicar por tracking haría que el bulto 2 se descarte
 * como repetido del bulto 1. El código del bulto es la clave correcta cuando
 * existe; el tracking queda como fallback para escaneos que no lo traen.
 */
export function scanDedupeKey(result: ScannerParseResult): string {
  return result.package?.code ?? result.trackingId ?? result.raw;
}
