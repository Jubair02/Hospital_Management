import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { getAdmissions, getWards } from '../../services/inpatientService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type { Admission, Ward, Pagination as PaginationInfo } from '../../types';
import Card from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Table, { type Column } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import { AdmissionStatusBadge } from '../../components/inpatient/InpatientBadges';

export default function AdmissionsPage() {
  const { role } = useAuth();
  const canAdmit = role === 'admin' || role === 'receptionist';

  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
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
  const [statusFilter, setStatusFilter] = useState('');
  const [wardFilter, setWardFilter] = useState('');
  const [date, setDate] = useState('');
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
      const data = await getAdmissions({
        page,
        limit: 10,
        search: search || undefined,
        status: statusFilter || undefined,
        wardId: wardFilter || undefined,
        dateFrom: date || undefined,
        dateTo: date || undefined,
      });
      setAdmissions(data.admissions);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load admissions.'));
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, wardFilter, date]);

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

  const columns: Column<Admission>[] = [
    {
      key: 'admissionId',
      header: 'Admission',
      render: (a) => <span className="font-medium text-brand-800">{a.admissionId}</span>,
    },
    {
      key: 'patient',
      header: 'Patient',
      render: (a) =>
        a.patientId ? (
          <div>
            <p className="font-medium text-slate-800">
              {a.patientId.firstName} {a.patientId.lastName}
            </p>
            <p className="text-slate-500">{a.patientId.patientId}</p>
          </div>
        ) : (
          '—'
        ),
    },
    {
      key: 'doctor',
      header: 'Doctor',
      render: (a) => (a.doctorId ? `Dr. ${a.doctorId.firstName} ${a.doctorId.lastName}` : '—'),
    },
    { key: 'ward', header: 'Ward', render: (a) => a.wardId?.name ?? '—' },
    { key: 'bed', header: 'Bed', render: (a) => a.bedId?.bedNumber ?? '—' },
    { key: 'admissionDate', header: 'Admitted', render: (a) => formatDate(a.admissionDate) },
    { key: 'status', header: 'Status', render: (a) => <AdmissionStatusBadge status={a.status} /> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      render: (a) => (
        <Link to={`/inpatient/admissions/${a._id}`}>
          <Button variant="ghost" size="sm">
            Open
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {role === 'doctor' ? 'My inpatients' : 'Admissions'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {role === 'doctor'
              ? 'Admitted patients under your care.'
              : 'Inpatient admissions, newest first.'}
          </p>
        </div>
        {canAdmit && (
          <Link to="/inpatient/admissions/new">
            <Button>Admit patient</Button>
          </Link>
        )}
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            placeholder="Search admission ID or patient…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search admissions"
            className="lg:col-span-2"
          />
          <Select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            options={[
              { value: 'admitted', label: 'Admitted' },
              { value: 'transferred', label: 'Transferred' },
              { value: 'discharged', label: 'Discharged' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
            placeholder="All statuses"
          />
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
          <Input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by admission date"
          />
        </div>

        <Table
          columns={columns}
          rows={admissions}
          loading={loading}
          emptyState={
            <EmptyState
              title="No admissions found"
              description={
                canAdmit ? 'Admit the first patient to get started.' : 'Nothing to show yet.'
              }
              action={
                canAdmit && (
                  <Link to="/inpatient/admissions/new">
                    <Button size="sm">Admit patient</Button>
                  </Link>
                )
              }
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
