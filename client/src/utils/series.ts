import type { TimePoint } from '../types';

/** The plain numbers behind a series, for a sparkline. */
export const seriesValues = (points: TimePoint[]): number[] =>
  points.map((point) => point.value);

/**
 * Percentage change between the last two buckets of a series.
 *
 * Returns `undefined` rather than a made-up figure when there is nothing to
 * compare against, or when the previous bucket was zero — "up from nothing"
 * has no meaningful percentage, and rendering one as `∞%` or `100%` would be
 * inventing a fact about the hospital.
 *
 * Shared by the analytics page and the admin dashboard: the same figure shown
 * on two screens has to be computed once, or the two drift and the reader has
 * no way to tell which is right.
 */
export const bucketDelta = (points: TimePoint[]): number | undefined => {
  if (points.length < 2) return undefined;
  const latest = points[points.length - 1]!.value;
  const previous = points[points.length - 2]!.value;
  if (previous === 0) return undefined;
  return ((latest - previous) / previous) * 100;
};

/** Sum of a series — the period total behind a point-in-time figure. */
export const seriesTotal = (points: TimePoint[] | undefined): number =>
  (points ?? []).reduce((sum, point) => sum + point.value, 0);
