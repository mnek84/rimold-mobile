# Driver app — design system

Tokens live in `src/theme/theme.ts`. Shared components live in `src/components/ui/`.
**No colour literal may appear outside `src/theme/`.** If a screen needs a colour that
does not exist, add a token (with a measured contrast pair) — do not inline it.

## Identity

| | Value | Notes |
|---|---|---|
| Brand navy | `#0D347D` | Structure, navigation, primary actions |
| Brand green | `#5AC31D` | Accents, progress, positive outcomes — **never as text, never under white text** (2.3:1) |

These match the business portal. `assets/logo.png` samples slightly differently (wordmark
`#A0C51D`, globe `#263477`→`#0061A5`); the spec values win.

## Themes

Light is the default (outdoor use). Dark follows the OS, or the driver's choice in
**Ajustes → Apariencia** (Auto / Claro / Oscuro), persisted in `themePreferenceStore` and pushed to
native via `Appearance.setColorScheme` so alerts and the keyboard match.

## Colour roles

| Token | Use | Do not |
|---|---|---|
| `background` | Screen canvas | |
| `surface` | Cards, headers, sheets, tab bar, inputs | |
| `surfaceMuted` | Chips, segmented tracks, skeletons, neutral badges | Use as a card background on `background` |
| `text` / `muted` | Primary / secondary text. `muted` ≥ 4.5:1 everywhere | Lower opacity on text to "mute" it |
| `border` | Decorative hairline between surfaces | Outline an input with it (1.2:1) |
| `borderStrong` | Outline of an interactive control (≥ 3:1) | |
| `primary` / `primaryOn` | Navy. Ink **and** fill. Primary buttons, active tab, links, active stop | Put white/black on it — use `primaryOn` |
| `primarySoft` | Selected row, active chip, in-progress badge background | |
| `chrome` / `chromeOn` / `chromeControl` | Full-width brand bars (route progress header) | Use for buttons |
| `brand` / `brandOn` | Green fill accents: progress fills, brand moments | Use as text |
| `success` / `successOn` / `successSoft` | Delivered, collected, scan OK | |
| `danger` / `dangerOn` / `dangerSoft` | Failed delivery, error, destructive | |
| `warning` / `warningOn` / `warningSoft` | Needs attention, nothing failed | Use for brand accent (it is not orange-for-decoration) |
| `info` / `infoOn` / `infoSoft` | Neutral system info (sync, hints) | Use for actions — that is `primary` |
| `overlay` | Press / ripple tint | |
| `scrim` | Modal and sheet backdrop | |
| `media*` | Camera viewfinder, photo preview, scan flashes — theme-independent | Use outside camera/photo UIs |
| `mapMarkerRing` | Ring around map pins | |
| `mapInk` / `mapInkOn` | Selected-pin ring, pin count badges. Same in both themes: tiles stay light | Swap for `text` (near-white in dark) |
| `partnerFlex*` | Mercado Libre Flex badge (their brand, not ours) | |

In dark mode `primary` is a light brand blue with a navy `primaryOn`: no navy is legible as
text on the dark surface. The proposed dark navy `#244B91` is used as `chrome`, where it
carries white text at 8.4:1.

### Status → tone

Use `toneColors(theme, tone)` (`@theme`) or `<StatusBadge tone=…>`. Never build a tint with
string concatenation (`colors.primary + '22'`) — use the `*Soft` token.

| Status | Tone | Icon (always pair one) |
|---|---|---|
| pending / not started | `neutral` | `time-outline` |
| in progress / en camino / active | `primary` | `navigate-outline` |
| delivered / collected / OK | `success` | `checkmark-circle` |
| failed / rejected / cancelled | `danger` | `close-circle` |
| needs attention | `warning` | `warning-outline` |
| system info / sync | `info` | `information-circle-outline` |

**Colour is never the only signal**: every status carries a text label, and an icon wherever space
allows.

## Typography

`typography.display | title | subtitle | body | bodyStrong | caption | captionStrong | micro`.
No raw `fontSize`. Nothing below 12 (`micro`). Pair `caption` with `muted`. For digits that
update in place, add `fontVariant: ['tabular-nums']`. Leave `allowFontScaling` on; cap with
`maxFontSizeMultiplier` (≈1.3–1.4) only on fixed-geometry elements (badges, pins, tab labels).

## Spacing, radii, touch

- Spacing: `xxs 2 · xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32`.
- Radii: `radiusSm 6` chips · `radiusMd 8` inline controls · `radiusLg 10` buttons/inputs ·
  `radiusXl 12` banners · `radiusCard 12` cards · `radiusPill` badges/FABs only.
- Touch: `touch.min 48` floor for anything tappable; `touch.primary 56` for the main action of a
  screen. Small glyphs get `hitSlop={touch.hitSlop}`.

## Components

| Component | Use |
|---|---|
| `Button` | Every text button. Variants: `primary`, `success`, `danger`, `secondary`, `outline`, `dangerOutline`, `ghost`. Sizes `sm 40 · md 48 · lg 56`. Optional `icon`. One `primary` per view. |
| `IconButton` | Icon-only controls; `accessibilityLabel` required; touch target ≥ 48. |
| `Card` | Grouping. Don't nest cards; don't wrap single rows in cards. |
| `Input` | Text fields: `borderStrong` outline, navy focus ring, error state. |
| `StatusBadge` | Status pills (label + optional icon, `soft` or `solid`). |
| `Banner` | Inline notices (offline, permission, scan result, sync error). |
| `SegmentedControl` | 2–4 mutually exclusive options. |
| `ScreenContainer` | Screen shell with safe area + optional scroll/keyboard avoidance. |

## Restraint

No gradients. No decorative orange. Shadows only for things floating over a map or content.
Animations limited to press feedback, toasts and native stack transitions.

## Guardrails and visual QA

- `npm run lint:tokens` — fails on any colour literal, alpha-concat tint or raw `fontSize` outside
  `src/theme/`. `npm run typecheck` — `tsc --noEmit`.
- **Ajustes → "Vista de diseño (dev)"** (only when `__DEV__`): renders the real workflow components
  (route header, stop card, stop list, route actions, shipment list, detail + actions, incident
  sheet) with synthetic fixtures, plus token swatches and every component state, with an
  Apariencia switch. Use it to check both themes on a physical device without a backend or customer
  data. Source: `src/dev/DesignPreview.tsx`.
- Reference captures: `docs/design-system/screenshots/` (`<scene>-light|dark.png`, `pair-<scene>.png`).
  They were rendered through react-native-web, so the map is a placeholder (react-native-maps is
  native-only) and the incident sheet clips slightly at the right edge — a web `position: fixed`
  artefact, not an app bug.
