import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const SECURE_KEY = 'employee_linked_device_id';
const ASYNC_FALLBACK = '@logistica/employee_linked_device_id';

/**
 * Stable per-install device id for employee QR login binding (optional server-side layer).
 * Persists in SecureStore; falls back to AsyncStorage if SecureStore is unavailable.
 */
export async function getLinkedDeviceId(): Promise<string> {
  try {
    const existing = await SecureStore.getItemAsync(SECURE_KEY);
    if (existing !== null && existing !== '') {
      return existing;
    }
    const id = Crypto.randomUUID();
    await SecureStore.setItemAsync(SECURE_KEY, id);
    return id;
  } catch {
    const fallback = await AsyncStorage.getItem(ASYNC_FALLBACK);
    if (fallback !== null && fallback !== '') {
      return fallback;
    }
    const id = Crypto.randomUUID();
    await AsyncStorage.setItem(ASYNC_FALLBACK, id);
    return id;
  }
}
