import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getLabOrders } from '../../services/laboratoryService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type { LabOrder, Pagination as PaginationInfo } from '../../types';
import Card from '../ui/Card';
import Alert from '../ui/Alert';
import Table, { type Column } from '../ui/Table';
import Pagination from '../ui/Pagination';
import { LabOrderStatusBadge, PriorityBadge } from './LabBadges';

/** Laboratory history section on the patient profile. */
export default function PatientLabHistoryCard({ patientMongoId }: { patientMongoId: string }) {
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 5,
    total: 0,
    totalPages: 1,
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getLabOrders({ patientId: patientMongoId, page, limit: 5 });
      setOrders(data.orders);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load laboratory history.'));
    } finally {
      setLoading(false);
    }
  }, [patientMongoId, page]);

  useEffect(() => {
    load();
  }, [load]);

  const columns: Column<LabOrder>[] = [
    {
      key: 'orderId',
      header: 'Order',
      render: (o) => (
        <Link
          to={`/laboratory/orders/${o._id}`}
          className="font-medium text-brand-800 hover:underline"
        >
          {o.orderId}
        </Link>
      ),
    },
    {
      key: 'tests',
      header: 'Tests',
      render: (o) => o.tests.map((t) => t.testName).join(', '),
    },
    { key: 'orderedAt', header: 'Ordered', render: (o) => formatDate(o.orderedAt) },
    { key: 'priority', header: 'Priority', render: (o) => <PriorityBadge priority={o.priority} /> },
    { key: 'status', header: 'Status', render: (o) => <LabOrderStatusBadge status={o.status} /> },
  ];

  return (
    <Card title="Laboratory history" subtitle="Lab orders for this patient">
      {error && <Alert tone="error" className="mb-3">{error}</Alert>}
      <Table
        columns={columns}
        rows={orders}
        loading={loading}
        emptyState={<p className="text-center text-sm text-slate-500">No lab orders yet.</p>}
      />
      <div className="mt-3">
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          onPageChange={setPage}
          disabled={loading}
        />
      </div>
    </Card>
  );
}
