import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Vibration } from 'react-native';

/**
 * Audio + haptic feedback helper for QR scanning across modules
 * (colecta and depósito). Players are created once and replayed,
 * which is faster and avoids creating/destroying players on every scan.
 */

export type ScanOutcome = 'success' | 'error';

const SUCCESS_ASSET = require('../../../assets/sounds/industrial_beep.wav') as number;
const ERROR_ASSET = require('../../../assets/sounds/beep.wav') as number;

const ERROR_GAP_MS = 120;

const SUCCESS_VIBRATION_MS = 55;
const ERROR_VIBRATION_PATTERN: number[] = [0, 80, 60, 80];

let audioModeReady = false;
let audioModePromise: Promise<void> | null = null;

const playerCache = new Map<number, AudioPlayer>();

async function ensureAudioMode(): Promise<void> {
  if (audioModeReady) return;
  if (audioModePromise === null) {
    audioModePromise = setAudioModeAsync({ playsInSilentMode: true })
      .then(() => {
        audioModeReady = true;
      })
      .catch(() => {
        // If the audio mode fails to set, swallow — vibration still works.
      });
  }
  await audioModePromise;
}

function loadPlayer(asset: number): AudioPlayer {
  const cached = playerCache.get(asset);
  if (cached !== undefined) return cached;

  const player = createAudioPlayer(asset);
  player.volume = 1;
  playerCache.set(asset, player);
  return player;
}

async function playOnce(asset: number): Promise<void> {
  try {
    await ensureAudioMode();
    const player = loadPlayer(asset);
    // expo-audio does not rewind on finish: seek back to the start before replaying.
    await player.seekTo(0);
    player.play();
  } catch {
    // Replays can fail if the player was released externally; drop the cache and let the next call recreate it.
    const stale = playerCache.get(asset);
    playerCache.delete(asset);
    try {
      stale?.remove();
    } catch {
      // already released
    }
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
  try {
    loadPlayer(SUCCESS_ASSET);
    loadPlayer(ERROR_ASSET);
  } catch {
    // Preloading is best-effort; playOnce retries.
  }
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
