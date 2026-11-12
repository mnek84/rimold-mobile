import { DarkTheme, DefaultTheme, type Theme } from '@react-navigation/native';
import { useMemo } from 'react';

import { useTheme } from './useTheme';

/**
 * React Navigation's own theme, derived from our tokens. Without it the
 * navigator paints its cards with its built-in white/black, which flashes
 * between screens and ignores the brand palette.
 */
export function useNavigationTheme(): Theme {
  const { scheme, colors } = useTheme();
  return useMemo<Theme>(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark: scheme === 'dark',
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        notification: colors.danger,
      },
    };
  }, [scheme, colors]);
}
