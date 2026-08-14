import StatCard, { type StatTone } from '../ui/StatCard';
import type { IconName } from '../ui/icons';

export interface Stat {
  label: string;
  value: number;
  hint?: string;
  /** Renders the value as money rather than a count. */
  money?: boolean;
  /** Highlights the value when it is above zero (problems needing action). */
  alert?: boolean;
  icon?: IconName;
  tone?: StatTone;
  /** Links the tile through to the records behind the number. */
  to?: string;
  /** Change against the previous bucket, as a percentage. */
  delta?: number;
  deltaLabel?: string;
  /** The series behind the figure, drawn as a bleed sparkline. */
  trend?: number[];
}

interface StatGridProps {
  stats: Stat[];
  loading?: boolean;
  columns?: 2 | 3 | 4;
}

const COLUMNS: Record<2 | 3 | 4, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
};

/**
 * KPI tiles. A bare number with its label reads faster than a chart for a
 * single value, so totals live here rather than in plots.
 *
 * Give a whole grid trends or give it none. Sparklines on some tiles and not
 * others makes a row ragged, because grid rows stretch to their tallest cell.
 */
export default function StatGrid({ stats, loading = false, columns = 4 }: StatGridProps) {
  return (
    <div className={`grid grid-cols-1 gap-4 ${COLUMNS[columns]}`}>
      {stats.map((stat) => (
        <StatCard
          key={stat.label}
          label={stat.label}
          value={loading ? null : stat.value}
          hint={stat.hint}
          money={stat.money}
          alert={stat.alert}
          icon={stat.icon}
          tone={stat.tone}
          to={stat.to}
          delta={loading ? undefined : stat.delta}
          deltaLabel={stat.deltaLabel}
          trend={loading ? undefined : stat.trend}
        />
      ))}
    </div>
  );
}
