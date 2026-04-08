import { randomUUID } from 'expo-crypto';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createEventUuid(): string {
  return randomUUID();
}

export function normalizeEventId(provided: string | undefined): string {
  if (provided != null && UUID_V4.test(provided.trim())) {
    return provided.trim();
  }
  return createEventUuid();
}
