import { useCallback, useState } from 'react';
import { getLaboratoryReport } from '../../services/analyticsService';
import type { LaboratoryReportData, ReportFilters } from '../../types';
import Card from '../../components/ui/Card';
import Select from '../../components/ui/Select';
import ReportShell from '../../components/analytics/ReportShell';
import StatGrid from '../../components/analytics/StatGrid';
import BarList from '../../components/charts/BarList';
import TimeSeriesChart from '../../components/charts/TimeSeriesChart';

const STATUS_OPTIONS = [
  { value: 'ordered', label: 'Ordered' },
  { value: 'sample_collected', label: 'Sample collected' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function LaboratoryReportPage() {
  const [status, setStatus] = useState('');

  const load = useCallback(
    (filters: ReportFilters) => getLaboratoryReport({ ...filters, status: status || undefined }),
    [status]
  );

  return (
    <ReportShell<LaboratoryReportData>
      title="Laboratory report"
      description="Order throughput and test demand from live laboratory records."
      report="laboratory"
      load={load}
      exportParams={{ status }}
      controls={
        <Select
          aria-label="Filter by order status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={STATUS_OPTIONS}
          placeholder="All statuses"
        />
      }
    >
      {(report) => (
        <div className="space-y-6">
          <StatGrid
            stats={[
              { label: 'Lab orders', value: report.summary.totalOrders, hint: 'In this period' },
              { label: 'Completed', value: report.summary.completed, hint: 'All results verified' },
              { label: 'Pending', value: report.summary.pending, hint: 'Awaiting collection or results' },
              { label: 'Cancelled', value: report.summary.cancelled, hint: 'Cancelled orders', alert: true },
            ]}
          />

          <Card title="Lab orders over time" subtitle="Orders per bucket">
            <TimeSeriesChart
              series={[{ name: 'Lab orders', points: report.series }]}
              ariaLabel="Laboratory orders over the selected period"
            />
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card title="Tests by category" subtitle="Ordered test count">
              <BarList items={report.byCategory} ariaLabel="Tests ordered per category" />
            </Card>
            <Card title="Most requested tests" subtitle="Ordered test count">
              <BarList items={report.topTests} limit={15} ariaLabel="Most requested tests" />
            </Card>
          </div>
        </div>
      )}
    </ReportShell>
  );
}
