/**
 * Chart palette.
 *
 * Data marks and interface chrome are deliberately separate concerns. The
 * brand blue doubles as the first data hue because it is chromatic enough
 * to read as a mark on white, but the *second* hue is amber rather than
 * another blue: blue/amber is the standard colour-vision-safe categorical
 * pair, staying separable under protanopia, deuteranopia and tritanopia,
 * where two blues collapse into one.
 *
 *   #2563eb  blue-600   contrast vs white 4.6:1   high chroma
 *   #d97706  amber-600  contrast vs white 3.1:1   high chroma
 *
 * Both clear the 3:1 floor for graphical objects, both clear the chroma
 * floor (neither reads grey), and the lightness gap is narrow enough that
 * neither series visually dominates the other.
 *
 * Hues are assigned in fixed order and never cycled — a third series would
 * need a third validated hue, not a wrap-around.
 */
export const SERIES_COLORS = ['#2563eb', '#d97706'] as const;

/** Single-measure magnitude (bar lists, sparklines) uses one hue. */
export const MAGNITUDE_COLOR = SERIES_COLORS[0];

/**
 * Ordered ramp for parts-of-a-whole whose categories carry no semantic
 * colour of their own. Slices are ranked by magnitude, so the ramp encodes
 * size rather than an arbitrary rainbow of identities.
 */
export const MAGNITUDE_RAMP = [
  '#1e40af',
  '#2563eb',
  '#3b7cf6',
  '#609afa',
  '#93bcfd',
  '#bfd7fe',
] as const;

/**
 * Semantic marks: status meaning, not category identity. Mirrors the five
 * StatCard tones so a sparkline inside a tile matches its icon plate.
 *
 * Note that `teal` — the brand accent — appears here but never in
 * SERIES_COLORS. Teal against blue is the pairing colour-blind viewers cannot
 * separate, so it is only ever used alone or against amber, never as blue's
 * partner in a multi-series chart.
 */
export const TONE_COLORS = {
  brand: '#2563eb',
  teal: '#0d9488',
  amber: '#d97706',
  rose: '#e11d48',
  slate: '#64748b',
} as const;

export type ChartTone = keyof typeof TONE_COLORS;

export const GRID_COLOR = '#e8edf5';
export const AXIS_TEXT = '#64748b';

/** Compact integer formatting for axes and labels. */
export const formatCount = (value: number): string =>
  value >= 10_000 ? `${Math.round(value / 1000)}k` : String(Math.round(value));

export const formatMoneyShort = (value: number): string =>
  value >= 10_000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(2);

/** "2026-08-13" → "13 Aug"; "2026-08" → "Aug 2026". */
export const formatBucket = (bucket: string): string => {
  const parts = bucket.split('-');
  const monthName = (index: number): string =>
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][index] ?? '';

  if (parts.length === 2) {
    return `${monthName(Number(parts[1]) - 1)} ${parts[0]}`;
  }
  if (parts.length === 3) {
    return `${Number(parts[2])} ${monthName(Number(parts[1]) - 1)}`;
  }
  return bucket;
};
