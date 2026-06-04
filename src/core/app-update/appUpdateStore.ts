import { create } from 'zustand';

import { getJSON, setJSON } from '@core/storage';

import { fetchAppRelease } from './api';
import { CHECK_INTERVAL_MS, LAST_APP_UPDATE_CHECK_KEY } from './constants';
import { downloadAndInstallApk } from './downloadAndInstallApk';
import {
  getInstalledVersionCode,
  getInstalledVersionName,
  isAndroidAppUpdateSupported,
} from './getInstalledVersionCode';
import type { AppRelease, AppUpdateStatus } from './types';

type AppUpdateState = {
  status: AppUpdateStatus;
  progress: number;
  message: string;
  blocked: boolean;
  remoteRelease: AppRelease | null;
  installedVersionCode: number;
  installedVersionName: string;
  lastCheckedAt: number | null;
  lastError: string | null;

  hydrateLastCheckedAt: () => Promise<void>;
  checkForUpdate: (options?: { force?: boolean }) => Promise<void>;
  retryUpdate: () => Promise<void>;
};

let updateInFlight = false;

function shouldRunScheduledCheck(lastCheckedAt: number | null, force: boolean): boolean {
  if (force) {
    return true;
  }
  if (lastCheckedAt == null) {
    return true;
  }
  return Date.now() - lastCheckedAt >= CHECK_INTERVAL_MS;
}

async function recordCheckTimestamp(set: (partial: Partial<AppUpdateState>) => void): Promise<void> {
  const now = Date.now();
  await setJSON(LAST_APP_UPDATE_CHECK_KEY, now);
  set({ lastCheckedAt: now });
}

async function runDownloadFlow(
  release: AppRelease,
  get: () => AppUpdateState,
  set: (partial: Partial<AppUpdateState>) => void,
): Promise<void> {
  set({
    status: 'downloading',
    progress: 0,
    blocked: true,
    remoteRelease: release,
    message: `Descargando actualización (${release.version_name})…`,
    lastError: null,
  });

  await downloadAndInstallApk(release, (progress) => {
    set({
      progress,
      message: `Descargando actualización (${progress}%)…`,
    });
  });

  set({
    status: 'installing',
    progress: 100,
    message:
      'Se abrió el instalador de Android. Confirmá la instalación para continuar y luego abrí la app nuevamente.',
  });
}

export const useAppUpdateStore = create<AppUpdateState>((set, get) => ({
  status: 'idle',
  progress: 0,
  message: '',
  blocked: false,
  remoteRelease: null,
  installedVersionCode: getInstalledVersionCode(),
  installedVersionName: getInstalledVersionName(),
  lastCheckedAt: null,
  lastError: null,

  hydrateLastCheckedAt: async () => {
    const stored = await getJSON<number>(LAST_APP_UPDATE_CHECK_KEY);
    if (typeof stored === 'number' && !Number.isNaN(stored)) {
      set({ lastCheckedAt: stored });
    }
  },

  checkForUpdate: async (options) => {
    if (!isAndroidAppUpdateSupported()) {
      return;
    }

    const force = options?.force === true;
    const state = get();

    if (updateInFlight) {
      return;
    }

    if (
      !force &&
      (state.status === 'downloading' || state.status === 'installing')
    ) {
      return;
    }

    if (!shouldRunScheduledCheck(state.lastCheckedAt, force)) {
      return;
    }

    updateInFlight = true;

    const installedVersionCode = getInstalledVersionCode();
    const installedVersionName = getInstalledVersionName();

    set({
      status: 'checking',
      installedVersionCode,
      installedVersionName,
      message: 'Verificando actualización…',
      lastError: null,
    });

    try {
      const release = await fetchAppRelease();
      await recordCheckTimestamp(set);

      if (release == null) {
        set({
          status: 'idle',
          blocked: false,
          remoteRelease: null,
          message: '',
        });
        return;
      }

      if (release.version_code === installedVersionCode) {
        set({
          status: force ? 'up_to_date' : 'idle',
          blocked: false,
          remoteRelease: release,
          message: force ? 'Ya tenés la última versión instalada.' : '',
        });
        return;
      }

      await runDownloadFlow(release, get, set);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo verificar la actualización. Reintentá en unos minutos.';

      set({
        status: 'error',
        blocked: false,
        lastError: message,
        message,
      });
    } finally {
      updateInFlight = false;
    }
  },

  retryUpdate: async () => {
    const { remoteRelease } = get();
    if (remoteRelease == null) {
      await get().checkForUpdate({ force: true });
      return;
    }

    if (updateInFlight) {
      return;
    }

    updateInFlight = true;
    set({ lastError: null });

    try {
      await runDownloadFlow(remoteRelease, get, set);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo completar la actualización. Reintentá en unos minutos.';

      set({
        status: 'error',
        blocked: true,
        lastError: message,
        message,
      });
    } finally {
      updateInFlight = false;
    }
  },
}));
