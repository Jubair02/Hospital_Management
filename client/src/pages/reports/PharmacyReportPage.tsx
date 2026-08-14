import { useCallback } from 'react';
import { getPharmacyReport } from '../../services/analyticsService';
import type { PharmacyReportData, ReportFilters } from '../../types';
import Card from '../../components/ui/Card';
import Table, { type Column } from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import ReportShell from '../../components/analytics/ReportShell';
import StatGrid from '../../components/analytics/StatGrid';
import BarList from '../../components/charts/BarList';
import TimeSeriesChart from '../../components/charts/TimeSeriesChart';

type LowStockRow = PharmacyReportData['lowStock'][number] & { id?: string };

export default function PharmacyReportPage() {
  const load = useCallback((filters: ReportFilters) => getPharmacyReport(filters), []);

  const lowStockColumns: Column<LowStockRow>[] = [
    { key: 'label', header: 'Medicine' },
    {
      key: 'count',
      header: 'Usable stock',
      render: (row) => (
        <span className="font-semibold tabular-nums text-rose-600">{row.count}</span>
      ),
    },
    { key: 'reorderLevel', header: 'Reorder level', render: (row) => row.reorderLevel },
    {
      key: 'flag',
      header: 'Status',
      render: () => <Badge tone="red">Below reorder level</Badge>,
    },
  ];

  return (
    <ReportShell<PharmacyReportData>
      title="Pharmacy report"
      description="Dispensing activity and stock health from live inventory records."
      report="pharmacy"
      load={load}
    >
      {(report) => (
        <div className="space-y-6">
          <StatGrid
            stats={[
              {
                label: 'Dispensing events',
                value: report.summary.dispensingEvents,
                hint: 'In this period',
              },
              { label: 'Units dispensed', value: report.summary.unitsDispensed, hint: 'Total units' },
              {
                label: 'Low stock',
                value: report.summary.lowStockCount,
                hint: 'Below reorder level',
                alert: true,
              },
              {
                label: 'Expired batches',
                value: report.summary.expiredBatches,
                hint: 'With units remaining',
                alert: true,
              },
            ]}
          />

          <Card title="Dispensing over time" subtitle="Dispensing events per bucket">
            <TimeSeriesChart
              series={[{ name: 'Dispensing', points: report.series }]}
              ariaLabel="Pharmacy dispensing events over the selected period"
            />
          </Card>

          <Card title="Most dispensed medicines" subtitle="Units dispensed in this period">
            <BarList
              items={report.topMedicines}
              limit={15}
              emptyMessage="Nothing dispensed in this period."
              ariaLabel="Units dispensed per medicine"
            />
          </Card>

          <Card title="Low stock" subtitle="Current stock below the reorder level">
            <Table
              columns={lowStockColumns}
              rows={report.lowStock.map((row, index) => ({ ...row, id: String(index) }))}
              emptyState={
                <p className="text-center text-sm text-slate-500">
                  Every active medicine is above its reorder level.
                </p>
              }
            />
          </Card>
        </div>
      )}
    </ReportShell>
  );
}
