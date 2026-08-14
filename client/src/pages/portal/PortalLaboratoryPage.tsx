import { useCallback, useEffect, useState } from 'react';
import { getLaboratory } from '../../services/portalService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type {
  Pagination as PaginationInfo,
  PortalLabOrder,
  PortalLabResult,
} from '../../types';
import Alert from '../../components/ui/Alert';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import Table, { type Column } from '../../components/ui/Table';
import { StatusBadge, doctorLabel } from './portalShared';

export default function PortalLaboratoryPage() {
  const [orders, setOrders] = useState<PortalLabOrder[] | null>(null);
  const [results, setResults] = useState<PortalLabResult[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await getLaboratory({ page, limit: 10 });
      setOrders(data.orders);
      setResults(data.results);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load your laboratory data.'));
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (orders === null) return <FullPageSpinner label="Loading laboratory data" />;

  const resultsByOrder = new Map<string, PortalLabResult[]>();
  for (const result of results) {
    const list = resultsByOrder.get(result.orderId) ?? [];
    list.push(result);
    resultsByOrder.set(result.orderId, list);
  }

  const resultColumns: Column<PortalLabResult>[] = [
    {
      key: 'testName',
      header: 'Test',
      render: (r) => <span className="font-medium text-slate-800">{r.testName}</span>,
    },
    {
      key: 'value',
      header: 'Result',
      render: (r) => (
        <span className="tabular-nums text-slate-800">
          {r.value ?? '—'}
          {r.unit ? ` ${r.unit}` : ''}
        </span>
      ),
    },
    {
      key: 'referenceRange',
      header: 'Reference range',
      render: (r) => r.referenceRange ?? <span className="text-slate-400">—</span>,
    },
    {
      key: 'interpretation',
      header: 'Interpretation',
      render: (r) =>
        r.interpretation ? (
          <span className="text-slate-600">{r.interpretation}</span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'verifiedAt',
      header: 'Verified',
      render: (r) => (
        <span className="whitespace-nowrap text-slate-500">{formatDate(r.verifiedAt)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Patient portal"
        title="Lab results"
        subtitle="Only results checked and verified by the laboratory appear here. Discuss them with your doctor."
      />

      {orders.length === 0 ? (
        <Card>
          <EmptyState
            title="No lab orders yet"
            description="When a doctor orders tests for you, they show up here."
          />
        </Card>
      ) : (
        orders.map((order) => {
          const orderResults = resultsByOrder.get(order._id) ?? [];
          return (
            <Card
              key={order._id}
              title={`${order.orderId} · ${formatDate(order.orderedAt)}`}
              subtitle={`Ordered by ${doctorLabel(order.doctorId)} · ${order.tests
                .map((t) => t.testName)
                .join(', ')}`}
              actions={<StatusBadge status={order.status} />}
            >
              {orderResults.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Results are being processed. You will be notified when they are verified.
                </p>
              ) : (
                <Table columns={resultColumns} rows={orderResults} />
              )}
            </Card>
          );
        })
      )}

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={setPage}
      />
    </div>
  );
}
