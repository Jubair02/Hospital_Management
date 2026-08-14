import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getLabSamples } from '../../services/laboratoryService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type { LabSample, Pagination as PaginationInfo } from '../../types';
import Card from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import Table, { type Column } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import { SampleStatusBadge } from '../../components/laboratory/LabBadges';
import PageHeader from '../../components/ui/PageHeader';

export default function LabSamplesPage() {
  const [samples, setSamples] = useState<LabSample[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getLabSamples({ page, limit: 10, status: status || undefined });
      setSamples(data.samples);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load samples.'));
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    load();
  }, [load]);

  const columns: Column<LabSample>[] = [
    {
      key: 'sampleId',
      header: 'Sample',
      render: (s) => <span className="font-medium text-brand-800">{s.sampleId}</span>,
    },
    {
      key: 'order',
      header: 'Order',
      render: (s) =>
        typeof s.orderId === 'object' && s.orderId ? s.orderId.orderId : '—',
    },
    {
      key: 'patient',
      header: 'Patient',
      render: (s) =>
        typeof s.patientId === 'object' && s.patientId
          ? `${s.patientId.firstName} ${s.patientId.lastName} (${s.patientId.patientId})`
          : '—',
    },
    {
      key: 'sampleType',
      header: 'Type',
      render: (s) => <span className="capitalize">{s.sampleType}</span>,
    },
    { key: 'status', header: 'Status', render: (s) => <SampleStatusBadge status={s.status} /> },
    { key: 'createdAt', header: 'Requested', render: (s) => formatDate(s.createdAt) },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      render: (s) =>
        typeof s.orderId === 'object' && s.orderId ? (
          <Link to={`/laboratory/orders/${s.orderId._id}`}>
            <Button variant="ghost" size="sm">
              Open order
            </Button>
          </Link>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Samples"
        subtitle="Collection queue — collect or reject from the order page."
      />

      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <div className="max-w-xs">
          <Select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'collected', label: 'Collected' },
              { value: 'rejected', label: 'Rejected' },
            ]}
            placeholder="All statuses"
          />
        </div>
      </Card>

      <Table
        columns={columns}
        rows={samples}
        loading={loading}
        emptyState={
          <EmptyState title="No samples found" description="Nothing in this queue right now." />
        }
        footer={
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPageChange={setPage}
            disabled={loading}
          />
        }
      />
    </div>
  );
}
