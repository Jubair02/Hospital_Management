import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getBeds, getWards } from '../../services/inpatientService';
import { getErrorMessage } from '../../services/api';
import type { HospitalBed, Ward, Pagination as PaginationInfo } from '../../types';
import Card from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import Table, { type Column } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import { BedStatusBadge } from '../../components/inpatient/InpatientBadges';
import PageHeader from '../../components/ui/PageHeader';

export default function BedsPage() {
  const [beds, setBeds] = useState<HospitalBed[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [wardFilter, setWardFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    getWards({ limit: 100 })
      .then((data) => setWards(data.wards))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getBeds({
        page,
        limit: 10,
        wardId: wardFilter || undefined,
        status: statusFilter || undefined,
      });
      setBeds(data.beds);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load beds.'));
    } finally {
      setLoading(false);
    }
  }, [page, wardFilter, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const columns: Column<HospitalBed>[] = [
    {
      key: 'bedNumber',
      header: 'Bed',
      render: (b) => (
        <div>
          <p className="font-medium text-slate-800">{b.bedNumber}</p>
          <p className="text-slate-500">{b.bedId}</p>
        </div>
      ),
    },
    {
      key: 'ward',
      header: 'Ward',
      render: (b) =>
        typeof b.wardId === 'object' && b.wardId ? (
          <Link to={`/inpatient/wards/${b.wardId._id}`} className="text-brand-800 hover:underline">
            {b.wardId.name}
          </Link>
        ) : (
          '—'
        ),
    },
    { key: 'bedType', header: 'Type', render: (b) => b.bedType || '—' },
    { key: 'status', header: 'Status', render: (b) => <BedStatusBadge status={b.status} /> },
    {
      key: 'patient',
      header: 'Current patient',
      render: (b) =>
        b.currentPatientId ? (
          <Link to={`/patients/${b.currentPatientId._id}`} className="text-brand-800 hover:underline">
            {b.currentPatientId.firstName} {b.currentPatientId.lastName}
          </Link>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      render: (b) =>
        typeof b.wardId === 'object' && b.wardId ? (
          <Link to={`/inpatient/wards/${b.wardId._id}`}>
            <Button variant="ghost" size="sm">
              Open ward
            </Button>
          </Link>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Beds"
        subtitle="All beds across the hospital."
      />

      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Select
            aria-label="Filter by ward"
            value={wardFilter}
            onChange={(e) => {
              setWardFilter(e.target.value);
              setPage(1);
            }}
            options={wards.map((w) => ({ value: w._id, label: w.name }))}
            placeholder="All wards"
          />
          <Select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            options={[
              { value: 'available', label: 'Available' },
              { value: 'occupied', label: 'Occupied' },
              { value: 'reserved', label: 'Reserved' },
              { value: 'maintenance', label: 'Maintenance' },
              { value: 'inactive', label: 'Inactive' },
            ]}
            placeholder="All statuses"
          />
        </div>
      </Card>

      <Table
        columns={columns}
        rows={beds}
        loading={loading}
        emptyState={<EmptyState title="No beds found" description="Beds are managed per ward." />}
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
