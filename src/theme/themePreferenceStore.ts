import { Appearance } from 'react-native';
import { create } from 'zustand';

import { getItem, setItem } from '@core/storage';

/** What the driver chose in Ajustes. `system` follows the OS (the default). */
export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'theme-preference';

type ThemePreferenceState = {
  preference: ThemePreference;
  hydrated: boolean;
  setPreference: (preference: ThemePreference) => void;
  hydrate: () => Promise<void>;
};

function isPreference(v: unknown): v is ThemePreference {
  return v === 'system' || v === 'light' || v === 'dark';
}

/**
 * Pushes the choice to the native layer too, so alerts, the keyboard and
 * date pickers match the app instead of the OS. `'auto'` removes the override.
 */
function applyNativeOverride(preference: ThemePreference): void {
  try {
    Appearance.setColorScheme(preference === 'system' ? 'auto' : preference);
  } catch {
    // Web / older runtimes: the JS theme still switches; only native chrome won't.
  }
}

export const useThemePreferenceStore = create<ThemePreferenceState>((set) => ({
  preference: 'system',
  hydrated: false,
  setPreference: (preference) => {
    applyNativeOverride(preference);
    set({ preference });
    void setItem(STORAGE_KEY, preference).catch(() => undefined);
  },
  hydrate: async () => {
    try {
      const stored = await getItem(STORAGE_KEY);
      if (isPreference(stored)) {
        applyNativeOverride(stored);
        set({ preference: stored, hydrated: true });
        return;
      }
    } catch {
      // Storage unavailable: fall through to the system default.
    }
    set({ hydrated: true });
  },
}));
