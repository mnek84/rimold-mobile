import type { AppTheme } from './theme';

/**
 * Semantic tones. Every status in the app maps to exactly one of these:
 *
 * - `neutral`  pending / not started / informational meta
 * - `primary`  in progress / active / selected (navy)
 * - `brand`    brand moments and progress accents (green fill, dark ink)
 * - `success`  delivered / collected / scan OK
 * - `danger`   failed / rejected / cancelled
 * - `warning`  needs attention, but nothing failed
 * - `info`     neutral system information (sync, hints)
 */
export type Tone = 'neutral' | 'primary' | 'brand' | 'success' | 'danger' | 'warning' | 'info';

export type ToneColors = {
  /** Text / icon colour on a surface or on `soft`. */
  ink: string;
  /** Tinted background (badges, banners, selected rows). */
  soft: string;
  /** Border to pair with `soft`. */
  border: string;
  /** Solid fill (buttons, map pins, progress). */
  solid: string;
  /** Text / icon on `solid`. */
  onSolid: string;
};

export function toneColors(t: AppTheme, tone: Tone): ToneColors {
  const c = t.colors;
  switch (tone) {
    case 'primary':
      return { ink: c.primary, soft: c.primarySoft, border: c.primary, solid: c.primary, onSolid: c.primaryOn };
    case 'brand':
      // Green is not legible as ink in light mode; `success` is its readable shade.
      return { ink: c.success, soft: c.successSoft, border: c.brand, solid: c.brand, onSolid: c.brandOn };
    case 'success':
      return { ink: c.success, soft: c.successSoft, border: c.success, solid: c.success, onSolid: c.successOn };
    case 'danger':
      return { ink: c.danger, soft: c.dangerSoft, border: c.danger, solid: c.danger, onSolid: c.dangerOn };
    case 'warning':
      return { ink: c.warning, soft: c.warningSoft, border: c.warning, solid: c.warning, onSolid: c.warningOn };
    case 'info':
      return { ink: c.info, soft: c.infoSoft, border: c.info, solid: c.info, onSolid: c.infoOn };
    default:
      return { ink: c.muted, soft: c.surfaceMuted, border: c.border, solid: c.muted, onSolid: c.surface };
  }
}
