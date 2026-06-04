import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

/** Longest side in pixels after resize. */
const MAX_SIDE_PX = 900;
/** JPEG quality (0–1). Targets ~20–50 KB output for typical proof-of-delivery shots. */
const JPEG_QUALITY = 0.42;

/**
 * Requests camera (fallback: gallery) permission, launches the picker,
 * resizes to {@link MAX_SIDE_PX} on the longest side, and compresses to JPEG.
 *
 * @returns A `data:image/jpeg;base64,...` string, or `null` if the user cancelled
 *          or denied all permissions.
 */
export async function pickAndCompressPhoto(permissionPrompt?: string): Promise<string | null> {
  const camPerm = await ImagePicker.requestCameraPermissionsAsync();

  let asset: ImagePicker.ImagePickerAsset | null = null;

  if (camPerm.granted) {
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 1 });
    if (result.canceled || result.assets[0] == null) return null;
    asset = result.assets[0];
  } else {
    const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!libPerm.granted) {
      Alert.alert(
        'Permisos requeridos',
        permissionPrompt ?? 'Se necesita acceso a la cámara o galería para adjuntar la foto.',
      );
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled || result.assets[0] == null) return null;
    asset = result.assets[0];
  }

  // Resize so the longest side is MAX_SIDE_PX (maintains aspect ratio)
  const resize =
    asset.width >= asset.height ? { width: MAX_SIDE_PX } : { height: MAX_SIDE_PX };

  const manipulated = await ImageManipulator.manipulateAsync(
    asset.uri,
    [{ resize }],
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );

  if (manipulated.base64 == null || manipulated.base64 === '') return null;
  return `data:image/jpeg;base64,${manipulated.base64}`;
}
