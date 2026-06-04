import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';

import { buildTheme, type AppTheme, type ColorScheme } from './theme';

const ThemeContext = createContext<AppTheme>(buildTheme('dark'));

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const scheme: ColorScheme = systemScheme === 'light' ? 'light' : 'dark';
  const value = useMemo(() => buildTheme(scheme), [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): AppTheme {
  return useContext(ThemeContext);
}
