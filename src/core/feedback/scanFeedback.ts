import { Audio } from 'expo-av';
import { Vibration } from 'react-native';

/**
 * Audio + haptic feedback helper for QR scanning across modules
 * (colecta and depósito). Sounds are loaded once and replayed,
 * which is faster and avoids creating/destroying Sound objects
 * on every scan.
 */

export type ScanOutcome = 'success' | 'error';

const SUCCESS_ASSET = require('../../../assets/sounds/industrial_beep.wav') as number;
const ERROR_ASSET = require('../../../assets/sounds/beep.wav') as number;

const ERROR_GAP_MS = 120;

const SUCCESS_VIBRATION_MS = 55;
const ERROR_VIBRATION_PATTERN: number[] = [0, 80, 60, 80];

let audioModeReady = false;
let audioModePromise: Promise<void> | null = null;

const soundCache = new Map<number, Audio.Sound>();
const soundLoading = new Map<number, Promise<Audio.Sound>>();

async function ensureAudioMode(): Promise<void> {
  if (audioModeReady) return;
  if (audioModePromise === null) {
    audioModePromise = Audio.setAudioModeAsync({ playsInSilentModeIOS: true })
      .then(() => {
        audioModeReady = true;
      })
      .catch(() => {
        // If the audio mode fails to set, swallow — vibration still works.
      });
  }
  await audioModePromise;
}

async function loadSound(asset: number): Promise<Audio.Sound> {
  const cached = soundCache.get(asset);
  if (cached !== undefined) return cached;

  const inFlight = soundLoading.get(asset);
  if (inFlight !== undefined) return inFlight;

  const promise = (async () => {
    const { sound } = await Audio.Sound.createAsync(asset, { shouldPlay: false, volume: 1 });
    soundCache.set(asset, sound);
    soundLoading.delete(asset);
    return sound;
  })();
  soundLoading.set(asset, promise);
  return promise;
}

async function playOnce(asset: number): Promise<void> {
  try {
    await ensureAudioMode();
    const sound = await loadSound(asset);
    await sound.replayAsync();
  } catch {
    // Replays can fail if the sound was unloaded externally; drop the cache and let the next call reload.
    soundCache.delete(asset);
  }
}

/**
 * Pre-loads the scan sounds and configures iOS silent mode playback.
 * Safe to call multiple times — it short-circuits after the first run.
 * Call from a screen's `useEffect` so the first real scan does not
 * pay the load cost.
 */
export function prepareScanAudio(): void {
  void ensureAudioMode();
  void loadSound(SUCCESS_ASSET);
  void loadSound(ERROR_ASSET);
}

/**
 * Plays the success beep + a short vibration tick.
 */
export function playScanSuccess(): void {
  void playOnce(SUCCESS_ASSET);
  Vibration.vibrate(SUCCESS_VIBRATION_MS);
}

/**
 * Plays a quick "beep-beep" + a stronger vibration pattern so the
 * operator distinguishes errors from successful scans without looking.
 */
export function playScanError(): void {
  void (async () => {
    await playOnce(ERROR_ASSET);
    setTimeout(() => {
      void playOnce(ERROR_ASSET);
    }, ERROR_GAP_MS);
  })();
  Vibration.vibrate(ERROR_VIBRATION_PATTERN);
}

/** Convenience dispatcher for callers that hold an outcome variable. */
export function playScanFeedback(outcome: ScanOutcome): void {
  if (outcome === 'success') {
    playScanSuccess();
  } else {
    playScanError();
  }
}
