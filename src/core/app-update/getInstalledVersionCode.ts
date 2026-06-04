import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export function isAndroidAppUpdateSupported(): boolean {
  return Platform.OS === 'android';
}

export function getInstalledVersionCode(): number {
  if (!isAndroidAppUpdateSupported()) {
    return 0;
  }

  const raw = Application.nativeBuildVersion?.trim();
  const parsed = raw != null && raw !== '' ? Number.parseInt(raw, 10) : Number.NaN;

  return Number.isFinite(parsed) ? parsed : 0;
}

export function getInstalledVersionName(): string {
  if (!isAndroidAppUpdateSupported()) {
    return Constants.expoConfig?.version ?? '0.0.0';
  }

  return (
    Application.nativeApplicationVersion?.trim() ||
    Constants.expoConfig?.version ||
    '0.0.0'
  );
}
