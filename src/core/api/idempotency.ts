/** Standard header for idempotent writes (retries reuse the same event id). */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

export function idempotencyHeaders(eventId: string): { headers: Record<string, string> } {
  return { headers: { [IDEMPOTENCY_KEY_HEADER]: eventId } };
}
