/**
 * Design tokens — the ONLY place in the app where a colour literal may live.
 *
 * Brand (canonical, matching the business portal): navy #0D347D, green #5AC31D.
 * Note: the raster logo in `assets/logo.png` samples slightly differently
 * (wordmark #A0C51D, globe #263477→#0061A5). The values here follow the brand
 * spec, not the PNG.
 *
 * Every pair below was measured (WCAG 2.x relative luminance). Minimums:
 * body text ≥ 4.5:1, text on filled controls ≥ 4.5:1 (most ≥ 7:1 for outdoor
 * glare), control outlines (`borderStrong`) ≥ 3:1. Re-measure if you edit one.
 *
 * Two rules that look arbitrary and are not:
 *
 * 1. `primary` is both an INK (text, icons, tints on surfaces) and a FILL
 *    (buttons, active markers), and `primaryOn` is whatever reads on top of the
 *    fill. In light mode that is navy + white. In dark mode no navy can be both:
 *    the proposed #244B91 is 1.8:1 as text on the dark surface. So dark
 *    `primary` is a light brand blue and `primaryOn` is a deep navy ink — the
 *    Material dark-theme pattern. Never hardcode white (or black) on `primary`;
 *    use `primaryOn`.
 *
 * 2. Brand green is an ACCENT, not a text colour. #5AC31D is 2.3:1 against
 *    white — it fails as text and fails under white text. Use `brand` for fills
 *    with `brandOn` (dark ink) on top, and `success` (a darker green in light
 *    mode) whenever green has to be read.
 */

export type ColorScheme = 'light' | 'dark';

export type Palette = {
  /** App canvas behind everything. */
  background: string;
  /** Cards, headers, sheets, tab bar, inputs. */
  surface: string;
  /** Recessed areas inside a surface: chips, segmented tracks, skeletons, neutral badges. */
  surfaceMuted: string;

  /** Primary reading text. */
  text: string;
  /** Secondary text, captions, placeholders, inactive icons. */
  muted: string;

  /** Decorative hairline between surfaces. Not a control boundary. */
  border: string;
  /** Boundary of an interactive control (input, outline button, checkbox). ≥ 3:1. */
  borderStrong: string;

  /** Navy. Primary actions, active navigation, links, focus. Ink AND fill — see rule 1. */
  primary: string;
  /** Text/icon on a `primary` fill. */
  primaryOn: string;
  /** Tinted background for selected rows, active chips, info-ish emphasis in brand. `primary` reads on it. */
  primarySoft: string;

  /** Brand green. Accents, progress, brand moments. Fill only — see rule 2. */
  brand: string;
  /** Text/icon on a `brand` fill. */
  brandOn: string;

  /** Delivered / confirmed / scan OK. Ink AND fill. */
  success: string;
  successOn: string;
  /** Tinted success background; `success` and `text` read on it. */
  successSoft: string;

  /** Error / failed delivery / destructive. Ink AND fill. */
  danger: string;
  dangerOn: string;
  dangerSoft: string;

  /**
   * Attention: neither confirmation nor error.
   *
   * El caso que lo hizo falta: un re-escaneo de crossdocking devuelve la misma
   * jaula y el operario tiene que llevar el paquete igual. Pintarlo de verde lo
   * hace creer que sumo trabajo; de rojo, que algo fallo. Ninguna de las dos es
   * cierta.
   */
  warning: string;
  warningOn: string;
  warningSoft: string;

  /** Neutral information (sync notes, hints). Deliberately not navy so it does not read as an action. */
  info: string;
  infoOn: string;
  infoSoft: string;

  /** Translucent press/ripple tint. */
  overlay: string;
  /** Modal / sheet backdrop. */
  scrim: string;
  /**
   * Brand bar: the navy strip across the top of the route map and similar
   * full-width brand surfaces. Separate from `primary` because a large area
   * filled with dark-mode `primary` (light blue) would glare at night; the
   * proposed dark navy #244B91 is wrong as ink (1.8:1) but right here (8.4:1
   * under white).
   */
  chrome: string;
  chromeOn: string;
  /** Round control placed on `chrome` (refresh button inside the bar). */
  chromeControl: string;

  /**
   * Camera, photo preview and other media surfaces. Theme-independent on
   * purpose: a viewfinder is black in both themes.
   */
  media: string;
  mediaOn: string;
  /** Translucent bar over a camera feed. */
  mediaScrim: string;
  /** Scan result flash over a camera feed. */
  mediaSuccessFlash: string;
  mediaDangerFlash: string;

  /** Ring around map pins. Maps render light tiles in both themes. */
  mapMarkerRing: string;
  /**
   * Dark ink for map overlays (selected-pin ring, count badges). Same in both
   * themes on purpose: the tiles stay light, so `colors.text` (near-white in
   * dark mode) would vanish on them.
   */
  mapInk: string;
  mapInkOn: string;

  /** Mercado Libre Flex — partner brand, not ours. Kept here so it is not hardcoded. */
  partnerFlex: string;
  partnerFlexOn: string;

  /** Shadow base colour. */
  shadow: string;
};

const lightPalette: Palette = {
  background: '#F5F7F8',
  surface: '#FFFFFF',
  surfaceMuted: '#EDF1F4',

  text: '#172536',
  muted: '#5B6B80',

  border: '#E2E8F0',
  borderStrong: '#7B8A9F',

  primary: '#0D347D',
  primaryOn: '#FFFFFF',
  primarySoft: '#E7EDF8',

  brand: '#5AC31D',
  brandOn: '#0B2203',

  success: '#2E7A12',
  successOn: '#FFFFFF',
  successSoft: '#E9F6E0',

  danger: '#C42B2B',
  dangerOn: '#FFFFFF',
  dangerSoft: '#FDECEC',

  warning: '#9A5A00',
  warningOn: '#FFFFFF',
  warningSoft: '#FFF4DC',

  info: '#0A66A8',
  infoOn: '#FFFFFF',
  infoSoft: '#E4F1FB',

  overlay: 'rgba(13, 52, 125, 0.08)',
  scrim: 'rgba(16, 25, 35, 0.55)',
  chrome: '#0D347D',
  chromeOn: '#FFFFFF',
  chromeControl: 'rgba(255, 255, 255, 0.16)',

  media: '#000000',
  mediaOn: '#FFFFFF',
  mediaScrim: 'rgba(0, 0, 0, 0.55)',
  mediaSuccessFlash: 'rgba(46, 122, 18, 0.55)',
  mediaDangerFlash: 'rgba(196, 43, 43, 0.55)',

  mapMarkerRing: '#FFFFFF',
  mapInk: '#172536',
  mapInkOn: '#FFFFFF',

  partnerFlex: '#FFE600',
  partnerFlexOn: '#1F2937',

  shadow: '#0B1520',
};

const darkPalette: Palette = {
  background: '#101923',
  surface: '#192635',
  surfaceMuted: '#22324A',

  text: '#F1F5F9',
  muted: '#A8B5C5',

  border: '#304153',
  borderStrong: '#64788F',

  primary: '#8DB2F2',
  primaryOn: '#0B1F44',
  primarySoft: '#1D3A6B',

  brand: '#75D83D',
  brandOn: '#0E2405',

  success: '#75D83D',
  successOn: '#0E2405',
  successSoft: '#1E3A1E',

  danger: '#FF8A80',
  dangerOn: '#2E0806',
  dangerSoft: '#41202A',

  warning: '#F5BE4A',
  warningOn: '#2B1A00',
  warningSoft: '#3A2E1A',

  info: '#7CC4F2',
  infoOn: '#062A40',
  infoSoft: '#163650',

  overlay: 'rgba(241, 245, 249, 0.08)',
  scrim: 'rgba(0, 0, 0, 0.62)',
  chrome: '#244B91',
  chromeOn: '#FFFFFF',
  chromeControl: 'rgba(255, 255, 255, 0.14)',

  media: '#000000',
  mediaOn: '#FFFFFF',
  mediaScrim: 'rgba(0, 0, 0, 0.55)',
  mediaSuccessFlash: 'rgba(117, 216, 61, 0.45)',
  mediaDangerFlash: 'rgba(255, 138, 128, 0.45)',

  mapMarkerRing: '#FFFFFF',
  mapInk: '#172536',
  mapInkOn: '#FFFFFF',

  partnerFlex: '#FFE600',
  partnerFlexOn: '#1F2937',

  shadow: '#000000',
};

const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  /** Chips, small badges. */
  radiusSm: 6,
  /** Inline controls, thumbnails. */
  radiusMd: 8,
  /** Buttons and inputs. */
  radiusLg: 10,
  /** Sheets' inner blocks, banners. */
  radiusXl: 12,
  /** Cards. Restrained on purpose: a work tool, not a consumer app. */
  radiusCard: 12,
  /** Fully rounded pills / status badges / FABs. */
  radiusPill: 999,
} as const;

/**
 * Minimum touch target sizes. Drivers operate one-handed, often with gloves or
 * while walking: 48 is the floor for anything tappable, 56 for the action a
 * screen exists to perform.
 */
const touch = {
  min: 48,
  primary: 56,
  /** Extra invisible hit area for small icon glyphs (pass as `hitSlop`). */
  hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
} as const;

/**
 * App-wide type scale. Use these tokens only — no one-off font sizes.
 * Sizes are a notch above typical admin UIs: this is read outdoors, at arm's
 * length, often in motion. Nothing reads below 12.
 * - Pair **caption** with `colors.muted` for de-emphasised copy.
 * - The `*Strong` variants share size/leading with their base and add weight.
 */
const typography = {
  /** Hero figures: next-stop number, scan counters. */
  display: { fontSize: 32, fontWeight: '700' as const, lineHeight: 38 },
  /** Screen titles, hero tracking IDs. */
  title: { fontSize: 24, fontWeight: '700' as const, lineHeight: 30 },
  /** Section headings, card titles, emphasised single-line labels. */
  subtitle: { fontSize: 18, fontWeight: '600' as const, lineHeight: 24 },
  /** Paragraphs, inputs, primary reading text. */
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 22 },
  /** List primaries, button labels. */
  bodyStrong: { fontSize: 16, fontWeight: '600' as const, lineHeight: 22 },
  /** Meta, helper text. */
  caption: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  /** Form labels, small buttons, section tags. */
  captionStrong: { fontSize: 14, fontWeight: '600' as const, lineHeight: 20 },
  /** Badges, tab labels, map pin numbers. The smallest size in the app. */
  micro: { fontSize: 12, fontWeight: '600' as const, lineHeight: 16 },
} as const;

/** Short, subtle motion — prefer these over ad-hoc animation values. */
const motion = {
  /** Applied with opacity for press feedback on buttons and rows. */
  pressScale: 0.985,
  /** Filled / primary controls */
  pressOpacityStrong: 0.88,
  /** Cards, list rows, outline / toolbar controls */
  pressOpacitySoft: 0.92,
  /** Opacity of a disabled control. Keep ≥ 0.45 so the label stays legible. */
  disabledOpacity: 0.45,
  /** Native stack push/pop (ms). */
  stackTransitionMs: 250,
} as const;

/**
 * Card / surface elevation per scheme. Light relies on a hairline border plus a
 * faint shadow; dark relies on the surface step (shadows are invisible on dark).
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
    shadowColor: darkPalette.shadow,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffsetY: 2,
    androidElevation: 2,
  },
  light: {
    shadowColor: lightPalette.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffsetY: 2,
    androidElevation: 1,
  },
};

export type AppTheme = {
  scheme: ColorScheme;
  colors: Palette;
  spacing: typeof spacing;
  touch: typeof touch;
  typography: typeof typography;
  motion: typeof motion;
  elevation: Elevation;
};

export function buildTheme(scheme: ColorScheme): AppTheme {
  return {
    scheme,
    colors: scheme === 'light' ? lightPalette : darkPalette,
    spacing,
    touch,
    typography,
    motion,
    elevation: elevation[scheme],
  };
}

/**
 * `#RRGGBB` + alpha (0..1) → `rgba(...)`. Use for one-off translucency derived
 * from a token (map polylines, progress tracks). For tinted backgrounds prefer
 * the `*Soft` tokens: they are contrast-checked, an ad-hoc alpha is not.
 */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Default theme for entry points outside the provider. Light is the product default. */
export const theme: AppTheme = buildTheme('light');
