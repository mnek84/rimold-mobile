import { apiClient } from './client';

export async function submitCollection(items: string[]): Promise<void> {
  await apiClient.post('/collections', { items });
}
