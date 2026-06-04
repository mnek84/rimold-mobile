import * as Crypto from 'expo-crypto';
import { CryptoDigestAlgorithm } from 'expo-crypto';
import { File } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

import type { AppRelease } from './types';
import { APK_DOWNLOAD_FILENAME } from './constants';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function verifyApkSha256(localUri: string, expectedSha256: string): Promise<void> {
  const file = new File(localUri);
  const buffer = await file.arrayBuffer();
  const digest = await Crypto.digest(CryptoDigestAlgorithm.SHA256, buffer);
  const actual = bytesToHex(new Uint8Array(digest));

  if (actual.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new Error('La verificación del APK falló. El archivo descargado no coincide con el checksum esperado.');
  }
}

export async function downloadAndInstallApk(
  release: AppRelease,
  onProgress: (progressPercent: number) => void,
): Promise<void> {
  const cacheDir = FileSystem.cacheDirectory;
  if (cacheDir == null || cacheDir === '') {
    throw new Error('No se pudo acceder al almacenamiento temporal del dispositivo.');
  }

  const localUri = `${cacheDir}${APK_DOWNLOAD_FILENAME}`;

  try {
    const info = await FileSystem.getInfoAsync(localUri);
    if (info.exists) {
      await FileSystem.deleteAsync(localUri, { idempotent: true });
    }
  } catch {
    /* ignore cleanup errors */
  }

  const download = FileSystem.createDownloadResumable(
    release.apk_url,
    localUri,
    {},
    (progress) => {
      const total = progress.totalBytesExpectedToWrite;
      const written = progress.totalBytesWritten;
      if (total > 0) {
        onProgress(Math.min(100, Math.round((written / total) * 100)));
      }
    },
  );

  const result = await download.downloadAsync();
  if (result?.uri == null || result.uri === '') {
    throw new Error('No se pudo descargar la actualización.');
  }

  onProgress(100);

  if (release.sha256 != null && release.sha256.trim() !== '') {
    await verifyApkSha256(result.uri, release.sha256.trim());
  }

  const contentUri = await FileSystem.getContentUriAsync(result.uri);

  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1,
    type: 'application/vnd.android.package-archive',
  });
}
