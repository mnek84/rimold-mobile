export type ColorScheme = 'light' | 'dark';

export type Palette = {
  /** Acento principal (botones primarios, dots "actual", header tint, tab activa). */
  primary: string;
  /** Color de label/icono encima de un fill `primary`. */
  primaryOn: string;
  /** Fondo base de la app. */
  background: string;
  /** Superficie de cards, headers, modales. */
  surface: string;
  /** Variante sutil para secciones embebidas (banners, chips). */
  surfaceMuted: string;
  /** Texto principal. */
  text: string;
  /** Texto secundario / placeholders. */
  muted: string;
  /** Borde fino para separar superficies. */
  border: string;
  /** Tinte translucido para ripple/press feedback. */
  overlay: string;
  /** Confirmacion / entregado. */
  success: string;
  /** Texto sobre `success`. */
  successOn: string;
  /** Error / falla. */
  danger: string;
  /** Texto sobre `danger`. */
  dangerOn: string;
};

const darkPalette: Palette = {
  primary: '#f97316',
  primaryOn: '#ffffff',
  background: '#0d0e10',
  surface: '#18191c',
  surfaceMuted: '#22232a',
  text: '#f5f5f4',
  muted: '#a1a1aa',
  border: 'rgba(245, 245, 244, 0.12)',
  overlay: 'rgba(245, 245, 244, 0.10)',
  success: '#22c55e',
  successOn: '#062b14',
  danger: '#ef4444',
  dangerOn: '#ffffff',
};

const lightPalette: Palette = {
  primary: '#ea580c',
  primaryOn: '#ffffff',
  background: '#fafaf9',
  surface: '#ffffff',
  surfaceMuted: '#f5f5f4',
  text: '#0c0a09',
  muted: '#6b7280',
  border: 'rgba(15, 18, 22, 0.10)',
  overlay: 'rgba(15, 18, 22, 0.06)',
  success: '#16a34a',
  successOn: '#ffffff',
  danger: '#dc2626',
  dangerOn: '#ffffff',
};

const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  radiusSm: 8,
  radiusMd: 10,
  radiusLg: 12,
  radiusXl: 14,
  /** Premium cards (shipments, clients, settings blocks). */
  radiusCard: 18,
} as const;

/**
 * App-wide type scale. Prefer these tokens only — avoid one-off font sizes.
 * - **caption** is paired with `colors.muted` for de-emphasized copy.
 * - **bodyStrong** / **captionStrong** are same sizes as **body** / **caption** with semibold weight.
 */
const typography = {
  /** Large, bold — screen titles, hero tracking IDs */
  title: { fontSize: 24, fontWeight: '700' as const, lineHeight: 32 },
  /** Medium — section headings, emphasized single-line labels */
  subtitle: { fontSize: 18, fontWeight: '600' as const, lineHeight: 24 },
  /** Regular — paragraphs, inputs, primary reading text */
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  /** Semibold at body size — list primaries, button labels */
  bodyStrong: { fontSize: 16, fontWeight: '600' as const, lineHeight: 24 },
  /** Small — meta, helper text (use `colors.muted` on `Text`) */
  caption: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  /** Small semibold — badges, form labels, uppercase section tags */
  captionStrong: { fontSize: 13, fontWeight: '600' as const, lineHeight: 18 },
} as const;

/** Short, subtle motion — prefer these over ad-hoc animation values. */
const motion = {
  /** Applied with opacity for press feedback on buttons and rows. */
  pressScale: 0.985,
  /** Filled / primary controls */
  pressOpacityStrong: 0.9,
  /** Cards, list rows, outline / toolbar controls */
  pressOpacitySoft: 0.93,
  /** Native stack push/pop (ms). */
  stackTransitionMs: 270,
} as const;

/**
 * Card / surface elevation tuning per scheme. Sombra mas sutil en claro
 * (las superficies ya viven sobre fondo blanco/off-white).
 */
type Elevation = {
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffsetY: number;
  androidElevation: number;
};

const elevation: Record<ColorScheme, Elevation> = {
  dark: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffsetY: 3,
    androidElevation: 3,
  },
  light: {
    shadowColor: '#0c0a09',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffsetY: 2,
    androidElevation: 2,
  },
};

export type AppTheme = {
  scheme: ColorScheme;
  colors: Palette;
  spacing: typeof spacing;
  typography: typeof typography;
  motion: typeof motion;
  elevation: Elevation;
};

export function buildTheme(scheme: ColorScheme): AppTheme {
  return {
    scheme,
    colors: scheme === 'light' ? lightPalette : darkPalette,
    spacing,
    typography,
    motion,
    elevation: elevation[scheme],
  };
}

/** Backwards-compat default export — used solo por entry points donde aun no llega el provider. */
export const theme: AppTheme = buildTheme('dark');
