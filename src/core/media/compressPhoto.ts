import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

/** Longest side in pixels after resize. */
const MAX_SIDE_PX = 900;
/** JPEG quality (0–1). Targets ~20–50 KB output for typical proof-of-delivery shots. */
const JPEG_QUALITY = 0.42;
/**
 * Source-capture quality when going through the OS picker. Kept well below 1
 * to avoid feeding a full-resolution JPEG into the manipulator on Android
 * release. The resize+recompress step discards any source quality > ~0.6.
 */
const CAPTURE_QUALITY = 0.7;

export type PhotoCaptureFailure =
  | 'picker_failed'
  | 'manipulate_failed'
  | 'encode_failed'
  | 'unknown';

export class PhotoCaptureError extends Error {
  constructor(
    public readonly code: PhotoCaptureFailure,
    public readonly cause?: unknown,
  ) {
    super(`pickAndCompressPhoto: ${code}`);
    this.name = 'PhotoCaptureError';
  }
}

export type PhotoResult =
  | { ok: true; dataUrl: string }
  | { ok: false; reason: 'cancelled' | 'permission_denied' };

/**
 * Resize a captured image to {@link MAX_SIDE_PX} on the longest side and
 * return a `data:image/jpeg;base64,...` URL. Throws {@link PhotoCaptureError}
 * on failure. Callers already hold the URI (e.g. from CameraView's
 * `takePictureAsync`) so no picker is involved.
 */
export async function compressCapturedPhoto(
  uri: string,
  width?: number | null,
  height?: number | null,
): Promise<string> {
  // Some Android release builds return 0/undefined dimensions for freshly
  // captured camera frames. Fall back to width-only resize.
  const w = width ?? 0;
  const h = height ?? 0;
  const resize =
    w === 0 || h === 0
      ? { width: MAX_SIDE_PX }
      : w >= h
        ? { width: MAX_SIDE_PX }
        : { height: MAX_SIDE_PX };

  // First pass: resize + recompress to disk. NO base64 here — encoding a
  // full-res image inline with `base64: true` is what crashes on Android release.
  let manipulated;
  try {
    manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize }],
      { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
    );
  } catch (e) {
    throw new PhotoCaptureError('manipulate_failed', e);
  }

  // Primary: read the small manipulated file as base64.
  let base64 = '';
  try {
    base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch {
    base64 = '';
  }

  // Fallback: second manipulator pass with `base64: true` on the ALREADY-small
  // image. The OOM path only triggers on full-res inputs, so this is safe.
  if (base64 === '') {
    try {
      const again = await ImageManipulator.manipulateAsync(
        manipulated.uri,
        [],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      base64 = again.base64 ?? '';
    } catch (e) {
      throw new PhotoCaptureError('encode_failed', e);
    }
  }

  if (base64 === '') {
    throw new PhotoCaptureError('encode_failed');
  }

  return `data:image/jpeg;base64,${base64}`;
}

/**
 * Legacy path via the OS image picker. Kept for gallery fallback only —
 * `launchCameraAsync` has been unreliable on Android release builds (the
 * returned promise sometimes resolves with `canceled: true` after the user
 * confirms, because the RN Activity can be recreated during the external
 * intent round-trip). For camera capture, mount `PhotoCaptureModal` instead.
 */
export async function pickAndCompressPhoto(
  permissionPrompt?: string,
): Promise<PhotoResult> {
  let asset: ImagePicker.ImagePickerAsset | null = null;

  try {
    const camPerm = await ImagePicker.requestCameraPermissionsAsync();

    if (camPerm.granted) {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: CAPTURE_QUALITY,
      });
      if (result.canceled || result.assets[0] == null) {
        return { ok: false, reason: 'cancelled' };
      }
      asset = result.assets[0];
    } else {
      const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!libPerm.granted) {
        Alert.alert(
          'Permisos requeridos',
          permissionPrompt ?? 'Se necesita acceso a la cámara o galería para adjuntar la foto.',
        );
        return { ok: false, reason: 'permission_denied' };
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: CAPTURE_QUALITY,
      });
      if (result.canceled || result.assets[0] == null) {
        return { ok: false, reason: 'cancelled' };
      }
      asset = result.assets[0];
    }
  } catch (e) {
    throw new PhotoCaptureError('picker_failed', e);
  }

  const dataUrl = await compressCapturedPhoto(asset.uri, asset.width, asset.height);
  return { ok: true, dataUrl };
}
