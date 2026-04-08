/** Parsed QR payload after applying internal vs external rules. */
export type ScannerParseResult =
  | {
      raw: string;
      type: 'internal';
      trackingId: string | null;
    }
  | {
      raw: string;
      type: 'external';
      trackingId: null;
    }
  | {
      raw: string;
      type: 'mercadolibre';
      trackingId: string;
      clientId: number;
    };
