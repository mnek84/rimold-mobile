export const theme = {
  colors: {
    primary: '#2563eb',
    background: '#0f172a',
    surface: '#1e293b',
    text: '#f1f5f9',
    muted: '#94a3b8',
    success: '#22c55e',
    danger: '#ef4444',
  },
  spacing: {
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
  },
  /**
   * App-wide type scale. Prefer these tokens only — avoid one-off font sizes.
   * - **caption** is paired with `colors.muted` for de-emphasized copy.
   * - **bodyStrong** / **captionStrong** are same sizes as **body** / **caption** with semibold weight.
   */
  typography: {
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
  },
  /** Short, subtle motion — prefer these over ad-hoc animation values. */
  motion: {
    /** Applied with opacity for press feedback on buttons and rows. */
    pressScale: 0.985,
    /** Filled / primary controls */
    pressOpacityStrong: 0.9,
    /** Cards, list rows, outline / toolbar controls */
    pressOpacitySoft: 0.93,
    /** Native stack push/pop (ms). */
    stackTransitionMs: 270,
  },
} as const;

export type AppTheme = typeof theme;

/** Hairline borders and outlines on dark surfaces (from `muted`). */
export const borderSubtle = 'rgba(148, 163, 184, 0.22)';
