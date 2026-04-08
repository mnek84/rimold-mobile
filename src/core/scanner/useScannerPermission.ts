import { useCameraPermissions } from 'expo-camera';

/** Camera permission state for QR / barcode flows (expo-camera). */
export function useScannerPermission() {
  return useCameraPermissions();
}
