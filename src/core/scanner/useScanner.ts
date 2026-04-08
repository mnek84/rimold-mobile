import { useMemo } from 'react';

import { parseQrPayload } from './parseQrPayload';
import type { ScannerParseResult } from './types';

/**
 * Derives structured scanner data from a raw QR string.
 * Prefer `parseQrPayload` outside React; use this when the value comes from state/props.
 */
export function useScanner(raw: string): ScannerParseResult {
  return useMemo(() => parseQrPayload(raw), [raw]);
}
