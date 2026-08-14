import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getLabOrders } from '../../services/laboratoryService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type { LabOrder, Pagination as PaginationInfo } from '../../types';
import Card from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Table, { type Column } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import { LabOrderStatusBadge, PriorityBadge } from '../../components/laboratory/LabBadges';

const STATUS_OPTIONS = [
  { value: 'ordered', label: 'Ordered' },
  { value: 'sample_collected', label: 'Sample collected' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function LabOrdersPage() {
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getLabOrders({
        page,
        limit: 10,
        search: search || undefined,
        status: status || undefined,
        priority: priority || undefined,
        dateFrom: date || undefined,
        dateTo: date || undefined,
      });
      setOrders(data.orders);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load lab orders.'));
    } finally {
      setLoading(false);
    }
  }, [page, search, status, priority, date]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const columns: Column<LabOrder>[] = [
    {
      key: 'orderId',
      header: 'Order',
      render: (o) => <span className="font-medium text-brand-800">{o.orderId}</span>,
    },
    {
      key: 'patient',
      header: 'Patient',
      render: (o) =>
        o.patientId ? (
          <div>
            <p className="font-medium text-slate-800">
              {o.patientId.firstName} {o.patientId.lastName}
            </p>
            <p className="text-slate-500">{o.patientId.patientId}</p>
          </div>
        ) : (
          '—'
        ),
    },
    {
      key: 'doctor',
      header: 'Doctor',
      render: (o) => (o.doctorId ? `Dr. ${o.doctorId.firstName} ${o.doctorId.lastName}` : '—'),
    },
    { key: 'tests', header: 'Tests', render: (o) => `${o.tests.length}` },
    { key: 'priority', header: 'Priority', render: (o) => <PriorityBadge priority={o.priority} /> },
    { key: 'status', header: 'Status', render: (o) => <LabOrderStatusBadge status={o.status} /> },
    { key: 'orderedAt', header: 'Ordered', render: (o) => formatDate(o.orderedAt) },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      render: (o) => (
        <Link to={`/laboratory/orders/${o._id}`}>
          <Button variant="ghost" size="sm">
            Open
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Lab orders</h1>
        <p className="mt-1 text-sm text-slate-500">Orders placed by doctors, newest first.</p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            placeholder="Search order ID or patient…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search lab orders"
            className="lg:col-span-2"
          />
          <Select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            options={STATUS_OPTIONS}
            placeholder="All statuses"
          />
          <Select
            aria-label="Filter by priority"
            value={priority}
            onChange={(e) => {
              setPriority(e.target.value);
              setPage(1);
            }}
            options={[
              { value: 'routine', label: 'Routine' },
              { value: 'urgent', label: 'Urgent' },
            ]}
            placeholder="All priorities"
          />
          <Input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by date"
          />
        </div>

        <Table
          columns={columns}
          rows={orders}
          loading={loading}
          emptyState={
            <EmptyState
              title="No lab orders found"
              description="Orders appear here when doctors request tests from a consultation."
            />
          }
        />

        <div className="mt-4">
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPageChange={setPage}
            disabled={loading}
          />
        </div>
      </Card>
    </div>
  );
}
