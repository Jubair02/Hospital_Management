import { useCallback, useEffect, useState } from 'react';
import useAuth from '../../hooks/useAuth';
import { getClinicalReport } from '../../services/analyticsService';
import { getDepartments } from '../../services/departmentService';
import type { ClinicalReport, Department, ReportFilters, Role, TimePoint } from '../../types';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Select from '../../components/ui/Select';
import ReportShell from '../../components/analytics/ReportShell';
import StatGrid from '../../components/analytics/StatGrid';
import RankBoard, { InitialsPlate } from '../../components/analytics/RankBoard';
import DonutChart, { type DonutSlice } from '../../components/charts/DonutChart';
import StackedBar from '../../components/charts/StackedBar';
import TimeSeriesChart from '../../components/charts/TimeSeriesChart';
import { TONE_COLORS, formatBucket, type ChartTone } from '../../components/charts/chartTheme';

/** Departments shown as their own slice before the tail is pooled. */
const DEPARTMENT_SLICES = 5;

export default function ClinicalReportPage() {
  const { role } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState('');

  useEffect(() => {
    getDepartments()
      .then(setDepartments)
      .catch(() => {});
  }, []);

  const load = useCallback(
    (filters: ReportFilters) =>
      getClinicalReport({ ...filters, departmentId: departmentId || undefined }),
    [departmentId]
  );

  return (
    <ReportShell<ClinicalReport>
      title="Clinical report"
      description={
        role === 'doctor'
          ? 'Your consultation activity and the diagnoses you recorded.'
          : 'Consultation volume and the frequency of diagnoses as recorded by doctors.'
      }
      report="clinical"
      load={load}
      exportParams={{ departmentId }}
      controls={
        <Select
          aria-label="Filter by department"
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          options={departments.map((d) => ({ value: d._id, label: d.name }))}
          placeholder="All departments"
        />
      }
    >
      {(report) => <ClinicalReportBody report={report} role={role} />}
    </ReportShell>
  );
}

function ClinicalReportBody({ report, role }: { report: ClinicalReport; role: Role | null }) {
  const { total, completed, inProgress, withFollowUp } = report.summary;
  // in_progress / completed / cancelled are the only three statuses a
  // consultation can hold, so whatever the first two do not account for is
  // cancelled — no fourth bucket can hide in here.
  const cancelled = Math.max(0, total - completed - inProgress);
  const ownRecords = role === 'doctor';

  return (
    <div className="space-y-6">
      <StatGrid
        stats={[
          {
            label: 'Consultations',
            value: total,
            icon: 'clipboard',
            tone: 'brand',
            hint: ownRecords ? 'Records you opened in this range' : 'Records opened in this range',
          },
          {
            label: 'Completed',
            value: completed,
            icon: 'check',
            tone: 'teal',
            hint: 'Signed off and locked',
          },
          {
            label: 'In progress',
            value: inProgress,
            icon: 'clock',
            tone: 'amber',
            hint: 'Still open for editing',
          },
          {
            label: 'With follow-up',
            value: withFollowUp,
            icon: 'appointments',
            tone: 'brand',
            hint: 'A return date was set',
          },
        ]}
      />

      {total === 0 ? (
        <Card>
          <EmptyState
            title="No consultations in this range"
            description={
              ownRecords
                ? 'Nothing was recorded against your appointments here. Widen the date range, or clear the department filter.'
                : 'No clinical records were opened in this period. Widen the date range, or clear the department filter.'
            }
          />
        </Card>
      ) : (
        <>
          <ConsultationLoad report={report} cancelled={cancelled} />

          {ownRecords ? (
            <Card
              title="Your departments"
              subtitle="Where your consultations were recorded"
              icon="building"
            >
              <RankBoard
                items={report.byDepartment}
                total={total}
                ariaLabel="Your consultations per department"
                emptyMessage="No departments recorded in this period."
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
              <Card
                title="Department mix"
                subtitle="Share of clinical load"
                icon="building"
                footer={`${report.byDepartment.length} department${
                  report.byDepartment.length === 1 ? '' : 's'
                } saw patients in this period.`}
              >
                <DonutChart
                  slices={departmentSlices(report.byDepartment)}
                  centreLabel="records"
                  ariaLabel="Share of consultations per department"
                  emptyMessage="No departments recorded in this period."
                />
              </Card>

              <Card
                title="Consulting doctors"
                subtitle="Ranked by records opened"
                icon="doctors"
              >
                <RankBoard
                  items={report.byDoctor}
                  total={total}
                  leading={(item) => <InitialsPlate name={item.label} />}
                  ariaLabel="Consultations per doctor"
                  emptyMessage="No consultations attributed to a doctor here."
                />
              </Card>
            </div>
          )}

          <Card
            title="Recorded diagnoses"
            subtitle="Frequency of diagnoses exactly as doctors entered them"
            icon="activity"
            footer="Wording is grouped case-insensitively and otherwise left untouched. Percentages are of consultations in this range, and one consultation can carry several diagnoses."
          >
            <RankBoard
              items={report.topDiagnoses}
              initialRows={8}
              total={total}
              ariaLabel="Frequency of recorded diagnoses"
              emptyMessage="No diagnoses recorded in this period."
            />
          </Card>
        </>
      )}
    </div>
  );
}

/**
 * The headline band: volume over time reading left to right, with the status
 * split and the two rates that qualify it held in a rail beside the plot.
 * Keeping them on one surface means the shape of the period and the quality of
 * the records behind it are read in a single glance rather than two.
 */
function ConsultationLoad({ report, cancelled }: { report: ClinicalReport; cancelled: number }) {
  const { total, completed, inProgress, withFollowUp } = report.summary;
  const peak = report.series.reduce<TimePoint | null>(
    (best, point) => (best === null || point.value > best.value ? point : best),
    null
  );

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="min-w-0 p-5">
          <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div>
              <h2 className="text-[0.9375rem] font-semibold text-slate-900">Consultation load</h2>
              <p className="mt-0.5 text-xs text-slate-500">Records opened per bucket</p>
            </div>
            {peak && peak.value > 0 && (
              <p className="text-xs text-slate-500">
                Busiest:{' '}
                <span className="font-semibold tabular-nums text-slate-700">
                  {formatBucket(peak.date)}
                </span>{' '}
                · {peak.value.toLocaleString()}
              </p>
            )}
          </header>

          <TimeSeriesChart
            series={[{ name: 'Consultations', points: report.series }]}
            height={236}
            ariaLabel="Consultations over the selected period"
          />
        </div>

        <div className="space-y-6 border-t border-line bg-slate-50/60 p-5 lg:border-l lg:border-t-0">
          <div>
            <h3 className="mb-3 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Record status
            </h3>
            <StackedBar
              segments={[
                { label: 'Completed', count: completed, tone: 'teal' },
                { label: 'In progress', count: inProgress, tone: 'amber' },
                { label: 'Cancelled', count: cancelled, tone: 'slate' },
              ]}
              ariaLabel="Consultation records by status"
            />
          </div>

          <RateMeter
            label="Completion rate"
            value={completed}
            total={total}
            tone="teal"
            caption={`${completed.toLocaleString()} of ${total.toLocaleString()} records signed off`}
          />

          <RateMeter
            label="Follow-up rate"
            value={withFollowUp}
            total={total}
            tone="brand"
            caption={`${withFollowUp.toLocaleString()} consultations set a return date`}
          />
        </div>
      </div>
    </Card>
  );
}

/** A proportion of a stated whole: the figure, the track, and what it counts. */
function RateMeter({
  label,
  value,
  total,
  tone,
  caption,
}: {
  label: string;
  value: number;
  total: number;
  tone: ChartTone;
  caption: string;
}) {
  const share = total > 0 ? (value / total) * 100 : 0;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
          {label}
        </h3>
        <p className="text-lg font-semibold leading-none tabular-nums text-slate-900">
          {share.toFixed(0)}%
        </p>
      </div>
      <span className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70">
        <span
          className="block h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${share}%`, backgroundColor: TONE_COLORS[tone] }}
        />
      </span>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">{caption}</p>
    </div>
  );
}

/**
 * Top departments keep their own slice; the tail is pooled rather than drawn,
 * because a ring of twelve near-identical slivers cannot be read and its
 * legend is longer than the chart it explains.
 */
function departmentSlices(byDepartment: ClinicalReport['byDepartment']): DonutSlice[] {
  const ranked = [...byDepartment].sort((a, b) => b.count - a.count);
  const head = ranked.slice(0, DEPARTMENT_SLICES);
  const tail = ranked.slice(DEPARTMENT_SLICES);

  if (tail.length === 0) return head;

  return [
    ...head,
    {
      label: `${tail.length} other department${tail.length === 1 ? '' : 's'}`,
      count: tail.reduce((sum, item) => sum + item.count, 0),
    },
  ];
}
