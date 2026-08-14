import useAuth from '../hooks/useAuth';
import { ROLE_LABELS } from '../utils/constants';
import Badge from './ui/Badge';
import PageHeader, { SectionHeading } from './ui/PageHeader';
import Icon, { type IconName } from './ui/icons';

export interface Kpi {
  label: string;
  hint: string;
  icon?: IconName;
}

/**
 * Dashboard body for roles whose statistics endpoints are not built yet: a
 * role-aware greeting and outlined KPI slots.
 *
 * The tiles are deliberately drawn as dashed placeholders rather than as real
 * cards showing a zero — a styled "0" is indistinguishable from a genuine
 * reading, and on a ward dashboard that is a clinical hazard, not a cosmetic
 * one.
 */
export default function DashboardPlaceholder({ kpis }: { kpis: Kpi[] }) {
  const { user, role } = useAuth();

  const salutation = role === 'doctor' ? `Dr. ${user?.lastName}` : user?.firstName;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={role ? ROLE_LABELS[role] : undefined}
        title={`Welcome, ${salutation ?? ''}`.trim()}
        subtitle="Your dashboard metrics are not wired up yet. Use the navigation to reach the records you need in the meantime."
      />

      <section className="space-y-3">
        <SectionHeading title="Coming soon" hint="These figures will appear here once available" />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="flex flex-col rounded-2xl border border-dashed border-line-strong bg-white/60 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  {kpi.label}
                </p>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-400">
                  <Icon name={kpi.icon ?? 'activity'} className="h-[1.125rem] w-[1.125rem]" />
                </span>
              </div>

              <p className="mt-3 text-[1.75rem] font-semibold leading-none text-slate-300">—</p>

              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500">{kpi.hint}</p>
                <Badge tone="slate">Not yet tracked</Badge>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
