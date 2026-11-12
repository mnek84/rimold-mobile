import { createContext, useContext, useEffect, useMemo, type PropsWithChildren } from 'react';
import { useColorScheme, View } from 'react-native';

import { buildTheme, type AppTheme, type ColorScheme } from './theme';
import { useThemePreferenceStore } from './themePreferenceStore';

const ThemeContext = createContext<AppTheme>(buildTheme('light'));

/** If storage never answers, render anyway with the system scheme. */
const HYDRATION_TIMEOUT_MS = 400;

/**
 * Resolves the active scheme: the driver's explicit choice (Ajustes → Apariencia)
 * wins; otherwise the OS setting; light when the OS reports nothing.
 */
export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const preference = useThemePreferenceStore((s) => s.preference);
  const hydrated = useThemePreferenceStore((s) => s.hydrated);
  const hydrate = useThemePreferenceStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
    const timer = setTimeout(() => {
      if (!useThemePreferenceStore.getState().hydrated) {
        useThemePreferenceStore.setState({ hydrated: true });
      }
    }, HYDRATION_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [hydrate]);

  const scheme: ColorScheme =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;
  const value = useMemo(() => buildTheme(scheme), [scheme]);

  return (
    <ThemeContext.Provider value={value}>
      {hydrated ? (
        children
      ) : (
        // Avoids a flash of the wrong theme for drivers who forced one.
        <View style={{ flex: 1, backgroundColor: value.colors.background }} />
      )}
    </ThemeContext.Provider>
  );
}

export function useTheme(): AppTheme {
  return useContext(ThemeContext);
}
