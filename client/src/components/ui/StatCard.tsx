import { Link } from 'react-router-dom';
import Sparkline from '../charts/Sparkline';
import { TONE_COLORS } from '../charts/chartTheme';
import Icon, { type IconName } from './icons';

/**
 * Five tones, each with a job:
 *   brand  — volume and totals, the neutral default
 *   teal   — the accent: settled, verified, in hand
 *   amber  — waiting on someone
 *   rose   — actually wrong
 *   slate  — inactive or archived
 *
 * Deliberately short. A row of six differently-coloured tiles is a rainbow,
 * not a hierarchy — repeating a tone across tiles that mean the same thing is
 * the point.
 */
export type StatTone = 'brand' | 'teal' | 'amber' | 'rose' | 'slate';

/**
 * Solid icon plate per tone. Filled rather than tinted: a pale plate with a
 * thin coloured stroke reads as grey at tile size, which defeats the point of
 * having tones at all. The colour has to be the plate, not the glyph.
 *
 * `slate` stays tinted — inactive should not compete with the four tones that
 * mean something.
 */
const TONE_PLATE: Record<StatTone, string> = {
  brand: 'bg-brand-600 text-white ring-brand-600',
  teal: 'bg-accent-600 text-white ring-accent-600',
  // amber-600, not 500: white on #f59e0b is only 2.2:1, under the 3:1 floor
  // for graphical objects. #d97706 clears it at 3.2:1.
  amber: 'bg-amber-600 text-white ring-amber-600',
  rose: 'bg-rose-600 text-white ring-rose-600',
  slate: 'bg-slate-100 text-slate-500 ring-slate-200',
};

export interface StatCardProps {
  label: string;
  /** `null` / `undefined` renders the loading state. */
  value: number | string | null | undefined;
  hint?: string;
  icon?: IconName;
  tone?: StatTone;
  /** Renders the value as money rather than a count. */
  money?: boolean;
  /** Turns the value red once above zero — queues that need action. */
  alert?: boolean;
  /** Change against the previous bucket, as a percentage. */
  delta?: number;
  /** What the delta is measured against, e.g. "vs previous day". */
  deltaLabel?: string;
  /** Chronological values behind the figure; drawn as a bleed sparkline. */
  trend?: number[];
  /** Makes the whole tile a link to the underlying records. */
  to?: string;
  className?: string;
}

const formatMoney = (value: number): string =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * One KPI. The reading order is fixed on purpose — label, then figure, then
 * context — so a row of tiles scans as a column of numbers instead of
 * forcing the eye to re-orient in every card.
 */
export default function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'brand',
  money = false,
  alert = false,
  delta,
  deltaLabel,
  trend,
  to,
  className = '',
}: StatCardProps) {
  const loading = value === null || value === undefined;
  const numeric = typeof value === 'number' ? value : undefined;
  const flagged = alert && numeric !== undefined && numeric > 0;

  const display =
    typeof value === 'number'
      ? money
        ? formatMoney(value)
        : value.toLocaleString()
      : value;

  const rising = delta !== undefined && delta > 0;
  const flat = delta !== undefined && Math.round(delta * 10) === 0;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
          {label}
        </p>
        {icon && (
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${TONE_PLATE[tone]}`}
          >
            <Icon name={icon} className="h-[1.125rem] w-[1.125rem]" />
          </span>
        )}
      </div>

      {loading ? (
        <div className="mt-3.5 h-7 w-24 rounded-md skeleton" aria-label="Loading" />
      ) : (
        <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <p
            className={`text-[1.75rem] font-semibold leading-none tabular-nums ${
              flagged ? 'text-rose-600' : 'text-slate-900'
            }`}
          >
            {display}
          </p>

          {delta !== undefined && (
            <span
              className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold ${
                flat
                  ? 'bg-slate-100 text-slate-600'
                  : rising
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-rose-50 text-rose-700'
              }`}
            >
              {!flat && (
                <Icon name={rising ? 'arrowUp' : 'arrowDown'} className="h-3 w-3" strokeWidth="2.4" />
              )}
              {Math.abs(delta).toFixed(1)}%
              <span className="sr-only">
                {flat ? 'no change' : rising ? 'increase' : 'decrease'} {deltaLabel ?? ''}
              </span>
            </span>
          )}
        </div>
      )}

      {(hint || deltaLabel) && (
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          {hint}
          {hint && deltaLabel && <span className="text-slate-300"> · </span>}
          {deltaLabel}
        </p>
      )}

      {trend && trend.length > 1 && (
        <div className="-mx-5 -mb-5 mt-4">
          <Sparkline
            values={trend}
            color={TONE_COLORS[tone]}
            className="block h-10 w-full"
          />
        </div>
      )}
    </>
  );

  const shell = `surface-card relative flex min-w-0 flex-col overflow-hidden p-5 ${className}`;

  if (to) {
    return (
      <Link
        to={to}
        className={`${shell} group transition duration-200 hover:border-brand-200 hover:shadow-md`}
      >
        {body}
        {/* Affordance only where it cannot collide with a bleed sparkline. */}
        {!trend && (
          <Icon
            name="arrowRight"
            className="absolute bottom-4 right-4 h-4 w-4 text-brand-600 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          />
        )}
      </Link>
    );
  }

  return <div className={shell}>{body}</div>;
}
