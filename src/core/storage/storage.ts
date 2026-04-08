import AsyncStorage from '@react-native-async-storage/async-storage';

/** Namespace keys to avoid clashes with other libraries using AsyncStorage. */
const PREFIX = '@logistica/';

function namespacedKey(key: string): string {
  return PREFIX + key;
}

export async function getItem(key: string): Promise<string | null> {
  return AsyncStorage.getItem(namespacedKey(key));
}

export async function setItem(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(namespacedKey(key), value);
}

export async function removeItem(key: string): Promise<void> {
  await AsyncStorage.removeItem(namespacedKey(key));
}

export async function getJSON<T>(key: string): Promise<T | null> {
  const raw = await getItem(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setJSON(key: string, value: unknown): Promise<void> {
  await setItem(key, JSON.stringify(value));
}

/** Convenience bundle (same methods) for queue/cache callers. */
export const storage = {
  getItem,
  setItem,
  removeItem,
  getJSON,
  setJSON,
};
