import { useCallback } from 'react';
import { getPatientReport } from '../../services/analyticsService';
import type { PatientReport, ReportFilters } from '../../types';
import Card from '../../components/ui/Card';
import ReportShell from '../../components/analytics/ReportShell';
import StatGrid from '../../components/analytics/StatGrid';
import BarList from '../../components/charts/BarList';
import TimeSeriesChart from '../../components/charts/TimeSeriesChart';

export default function PatientsReportPage() {
  const load = useCallback((filters: ReportFilters) => getPatientReport(filters), []);

  return (
    <ReportShell<PatientReport>
      title="Patient report"
      description="Aggregate registration and demographic counts — no personal details are included."
      report="patients"
      load={load}
    >
      {(report) => (
        <div className="space-y-6">
          <StatGrid
            stats={[
              { label: 'Total patients', value: report.summary.total, hint: 'All time' },
              { label: 'New patients', value: report.summary.newInRange, hint: 'Registered in this period' },
              { label: 'Active', value: report.summary.active, hint: 'Active records' },
              { label: 'Inactive', value: report.summary.inactive, hint: 'Deactivated records' },
            ]}
          />

          <Card title="Registrations over time" subtitle="New patient records per bucket">
            <TimeSeriesChart
              series={[{ name: 'Registrations', points: report.series }]}
              ariaLabel="Patient registrations over the selected period"
            />
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card title="By gender" subtitle="All patients">
              <BarList items={report.byGender} ariaLabel="Patients per gender" />
            </Card>
            <Card title="By age group" subtitle="All patients">
              <BarList items={report.byAgeGroup} ariaLabel="Patients per age group" />
            </Card>
          </div>
        </div>
      )}
    </ReportShell>
  );
}
