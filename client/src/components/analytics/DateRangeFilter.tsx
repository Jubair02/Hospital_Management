import type { ReactNode } from 'react';
import type { RangePreset, ReportFilters } from '../../types';
import Input from '../ui/Input';

const PRESETS: Array<{ value: RangePreset; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
  { value: 'custom', label: 'Custom' },
];

interface DateRangeFilterProps {
  value: ReportFilters;
  onChange: (value: ReportFilters) => void;
  /** Rendered to the right of the range controls (filters, export). */
  children?: ReactNode;
}

/**
 * Shared range selector for the dashboard and every report. Only the preset
 * (and any custom dates) leave the browser — all filtering happens on the
 * server.
 *
 * A segmented control rather than a dropdown: five options that get switched
 * between constantly should cost one click, not two.
 */
export default function DateRangeFilter({ value, onChange, children }: DateRangeFilterProps) {
  const preset = value.range ?? 'month';
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div
          role="group"
          aria-label="Date range"
          className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-white p-1 shadow-xs"
        >
          {PRESETS.map((option) => {
            const active = preset === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  onChange({
                    range: option.value,
                    from: option.value === 'custom' ? value.from : undefined,
                    to: option.value === 'custom' ? value.to : undefined,
                  })
                }
                className={`rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium transition-colors duration-150 ${
                  active
                    ? 'bg-brand-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {preset === 'custom' && (
          <div className="flex flex-wrap items-end gap-2">
            <Input
              label="From"
              type="date"
              max={today}
              value={value.from ?? ''}
              onChange={(e) => onChange({ ...value, range: 'custom', from: e.target.value })}
            />
            <Input
              label="To"
              type="date"
              max={today}
              value={value.to ?? ''}
              onChange={(e) => onChange({ ...value, range: 'custom', to: e.target.value })}
            />
          </div>
        )}
      </div>

      {children && <div className="flex flex-wrap items-end gap-2">{children}</div>}
    </div>
  );
}
