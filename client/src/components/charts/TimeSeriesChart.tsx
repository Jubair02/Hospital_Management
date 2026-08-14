import { useEffect, useId, useRef, useState, type MouseEvent, type TouchEvent } from 'react';
import type { TimePoint } from '../../types';
import { AXIS_TEXT, GRID_COLOR, SERIES_COLORS, formatBucket, formatCount } from './chartTheme';

export interface ChartSeries {
  name: string;
  points: TimePoint[];
}

interface TimeSeriesChartProps {
  series: ChartSeries[];
  /** Formats values in the tooltip and on the y axis. */
  format?: (value: number) => string;
  height?: number;
  /** Screen-reader summary of what the chart shows. */
  ariaLabel: string;
}

const PAD = { top: 14, right: 14, bottom: 28, left: 46 };
const FALLBACK_WIDTH = 720;

/**
 * Line chart for one or two measures over time. A single measure gets an area
 * fill and no legend (the card title already names it); two measures get a
 * legend and the two validated hues. One shared y axis only — never a second
 * scale, which is the fastest way to make two series look correlated when
 * they are not.
 *
 * The chart draws at its real pixel width rather than scaling a fixed viewBox,
 * so axis labels stay at their intended size on a phone instead of shrinking
 * to a few pixels tall.
 */
export default function TimeSeriesChart({
  series,
  format = formatCount,
  height = 210,
  ariaLabel,
}: TimeSeriesChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  const containerRef = useRef<HTMLDivElement>(null);
  const gradientId = useId();

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width ?? 0;
      if (measured > 0) setWidth(Math.max(260, Math.round(measured)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const buckets = series[0]?.points ?? [];
  const hasData = buckets.length > 0 && series.some((s) => s.points.some((p) => p.value !== 0));

  const plotWidth = Math.max(width - PAD.left - PAD.right, 40);
  const plotHeight = height - PAD.top - PAD.bottom;

  const maxValue = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.value)));
  // Round the axis top to something readable.
  const step = Math.pow(10, Math.max(0, String(Math.round(maxValue)).length - 2));
  const axisTop = Math.ceil(maxValue / step) * step || 1;

  const x = (index: number): number =>
    buckets.length === 1
      ? PAD.left + plotWidth / 2
      : PAD.left + (index / (buckets.length - 1)) * plotWidth;
  const y = (value: number): number => PAD.top + plotHeight - (value / axisTop) * plotHeight;

  const gridValues = [0, axisTop / 2, axisTop];

  // Label density follows the available width, so ticks never collide.
  const maxLabels = width < 380 ? 2 : width < 620 ? 3 : 5;
  const labelIndexes = (() => {
    if (buckets.length <= 1) return buckets.length === 1 ? [0] : [];
    const count = Math.min(maxLabels, buckets.length);
    const seen = new Set<number>();
    for (let i = 0; i < count; i += 1) {
      seen.add(Math.round((i / (count - 1)) * (buckets.length - 1)));
    }
    return [...seen].sort((a, b) => a - b);
  })();

  const pick = (clientX: number, rect: DOMRect) => {
    const ratio = (clientX - rect.left) / rect.width;
    const position = ((ratio * width - PAD.left) / plotWidth) * (buckets.length - 1);
    const index = Math.round(Math.min(Math.max(position, 0), buckets.length - 1));
    setActiveIndex(Number.isFinite(index) ? index : null);
  };

  const handleMove = (event: MouseEvent<SVGSVGElement>) => {
    pick(event.clientX, event.currentTarget.getBoundingClientRect());
  };

  const handleTouch = (event: TouchEvent<SVGSVGElement>) => {
    const touch = event.touches[0];
    if (touch) pick(touch.clientX, event.currentTarget.getBoundingClientRect());
  };

  const active = activeIndex !== null ? buckets[activeIndex] : undefined;

  if (buckets.length === 0) {
    return <p className="py-12 text-center text-sm text-slate-500">No data in this period.</p>;
  }

  return (
    <div className="relative min-w-0" ref={containerRef}>
      {series.length > 1 && (
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {series.map((s, i) => (
            <li key={s.name} className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }}
              />
              {s.name}
            </li>
          ))}
        </ul>
      )}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        height={height}
        role="img"
        aria-label={ariaLabel}
        className="block w-full max-w-full touch-pan-y select-none"
        onMouseMove={handleMove}
        onMouseLeave={() => setActiveIndex(null)}
        onTouchStart={handleTouch}
        onTouchMove={handleTouch}
        onTouchEnd={() => setActiveIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES_COLORS[0]} stopOpacity="0.20" />
            <stop offset="100%" stopColor={SERIES_COLORS[0]} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Recessive grid + y axis */}
        {gridValues.map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(value)}
              y2={y(value)}
              stroke={GRID_COLOR}
              strokeWidth="1"
            />
            <text
              x={PAD.left - 10}
              y={y(value) + 4}
              textAnchor="end"
              fontSize="11"
              fontWeight="500"
              fill={AXIS_TEXT}
            >
              {format(value)}
            </text>
          </g>
        ))}

        {/* x labels */}
        {labelIndexes.map((index) => (
          <text
            key={index}
            x={x(index)}
            y={height - 8}
            textAnchor={index === 0 ? 'start' : index === buckets.length - 1 ? 'end' : 'middle'}
            fontSize="11"
            fontWeight="500"
            fill={AXIS_TEXT}
          >
            {formatBucket(buckets[index]!.date)}
          </text>
        ))}

        {hasData &&
          series.map((s, seriesIndex) => {
            const color = SERIES_COLORS[seriesIndex % SERIES_COLORS.length];
            const line = s.points
              .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(point.value)}`)
              .join(' ');
            const last = s.points[s.points.length - 1];

            return (
              <g key={s.name}>
                {series.length === 1 && (
                  <path
                    d={`${line} L${x(s.points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`}
                    fill={`url(#${gradientId})`}
                  />
                )}
                <path
                  d={line}
                  fill="none"
                  stroke={color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* The latest reading is the one people look for first. */}
                {last && s.points.length > 1 && (
                  <circle
                    cx={x(s.points.length - 1)}
                    cy={y(last.value)}
                    r="3.5"
                    fill={color}
                    stroke="#ffffff"
                    strokeWidth="2"
                  />
                )}
                {/* A single point would be invisible as a line. */}
                {s.points.length === 1 && (
                  <circle cx={x(0)} cy={y(s.points[0]!.value)} r="4" fill={color} />
                )}
              </g>
            );
          })}

        {/* Crosshair + markers */}
        {activeIndex !== null && hasData && (
          <g>
            <line
              x1={x(activeIndex)}
              x2={x(activeIndex)}
              y1={PAD.top}
              y2={PAD.top + plotHeight}
              stroke={AXIS_TEXT}
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            {series.map((s, seriesIndex) => {
              const point = s.points[activeIndex];
              if (!point) return null;
              return (
                <circle
                  key={s.name}
                  cx={x(activeIndex)}
                  cy={y(point.value)}
                  r="4.5"
                  fill={SERIES_COLORS[seriesIndex % SERIES_COLORS.length]}
                  stroke="#ffffff"
                  strokeWidth="2"
                />
              );
            })}
          </g>
        )}
      </svg>

      {!hasData && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
          No activity in this period.
        </p>
      )}

      {/* Tooltip — clamped so it never hangs off the card edge */}
      {active && hasData && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-32 rounded-xl border border-line bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm"
          style={{
            left: `${Math.min(Math.max((x(activeIndex!) / width) * 100, 12), 88)}%`,
            transform: 'translateX(-50%)',
          }}
        >
          <p className="font-semibold text-slate-900">{formatBucket(active.date)}</p>
          {series.map((s, i) => (
            <p key={s.name} className="mt-1 flex items-center gap-1.5 text-slate-600">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }}
              />
              {series.length > 1 && <span>{s.name}</span>}
              <span className="ml-auto font-semibold tabular-nums text-slate-900">
                {format(s.points[activeIndex!]?.value ?? 0)}
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
