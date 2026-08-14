import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getLabResults } from '../../services/laboratoryService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type { LabResult, Pagination as PaginationInfo } from '../../types';
import Card from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import Table, { type Column } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import { LabResultStatusBadge } from '../../components/laboratory/LabBadges';
import PageHeader from '../../components/ui/PageHeader';

export default function LabResultsPage() {
  const [results, setResults] = useState<LabResult[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getLabResults({ page, limit: 10, status: status || undefined });
      setResults(data.results);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load results.'));
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    load();
  }, [load]);

  const columns: Column<LabResult>[] = [
    {
      key: 'resultId',
      header: 'Result',
      render: (r) => <span className="font-medium text-brand-800">{r.resultId}</span>,
    },
    { key: 'testName', header: 'Test' },
    {
      key: 'patient',
      header: 'Patient',
      render: (r) =>
        typeof r.patientId === 'object' && r.patientId
          ? `${r.patientId.firstName} ${r.patientId.lastName}`
          : '—',
    },
    {
      key: 'value',
      header: 'Value',
      render: (r) =>
        r.value ? (
          <span>
            <span className="font-semibold">{r.value}</span>
            {r.unit && <span className="ml-1 text-slate-500">{r.unit}</span>}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      key: 'referenceRange',
      header: 'Reference',
      render: (r) => r.referenceRange || <span className="text-slate-400">—</span>,
    },
    { key: 'status', header: 'Status', render: (r) => <LabResultStatusBadge status={r.status} /> },
    { key: 'createdAt', header: 'Ordered', render: (r) => formatDate(r.createdAt) },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      render: (r) =>
        typeof r.orderId === 'object' && r.orderId ? (
          <Link to={`/laboratory/orders/${r.orderId._id}`}>
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
        title="Results"
        subtitle="Result entry and verification happen on the order page."
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
              { value: 'processing', label: 'Processing' },
              { value: 'completed', label: 'Completed' },
              { value: 'verified', label: 'Verified' },
            ]}
            placeholder="All statuses"
          />
        </div>
      </Card>

      <Table
        columns={columns}
        rows={results}
        loading={loading}
        emptyState={<EmptyState title="No results found" description="Nothing here yet." />}
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
