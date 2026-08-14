import { useId } from 'react';
import { MAGNITUDE_COLOR } from './chartTheme';

interface SparklineProps {
  /** Chronological values. Two points is the useful minimum. */
  values: number[];
  color?: string;
  className?: string;
}

const WIDTH = 160;
const HEIGHT = 40;

/**
 * Shape-only trend line for KPI tiles: no axes, no ticks, no tooltip. It
 * answers "which way is this going" at a glance; the exact figures live in
 * the tile's value and in the full chart on the analytics page.
 *
 * Presentational by design — `aria-hidden`, because the tile already states
 * the value and its change in text.
 */
export default function Sparkline({
  values,
  color = MAGNITUDE_COLOR,
  className = '',
}: SparklineProps) {
  const gradientId = useId();

  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series should sit on the mid-line rather than divide by zero.
  const span = max - min || 1;
  // Asymmetric insets: leaving more headroom above the peak keeps the filled
  // area reading as a curve instead of as a solid colour block at the card
  // edge, which is what happens when the line runs along the top.
  const TOP = 13;
  const BOTTOM = 4;

  const x = (index: number): number => (index / (values.length - 1)) * WIDTH;
  const y = (value: number): number =>
    HEIGHT - BOTTOM - ((value - min) / span) * (HEIGHT - TOP - BOTTOM);

  const line = values.map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
  const area = `${line} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={`max-w-full ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.16" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
