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
import PageHeader from '../../components/ui/PageHeader';
import BackLink from '../../components/ui/BackLink';
import { canViewInpatientDashboard } from '../../utils/permissions';

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

  // Read from the live inputs so the control appears on the keystroke
  // rather than after the search debounce.
  const hasFilters = Boolean(searchInput || statusFilter || wardFilter || date);

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatusFilter('');
    setWardFilter('');
    setDate('');
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {canViewInpatientDashboard(role) && (
          <BackLink to="/inpatient" label="Inpatient" />
        )}

        <PageHeader
          title={role === 'doctor' ? 'My inpatients' : 'Admissions'}
          subtitle={
            role === 'doctor'
              ? 'Admitted patients under your care.'
              : 'Inpatient admissions, newest first.'
          }
          actions={
            canAdmit && (
              <Link to="/inpatient/admissions/new">
                <Button>Admit patient</Button>
              </Link>
            )
          }
        />
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <Card padded={false}>
        <div className="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
        </div>

        {hasFilters && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line bg-slate-50/60 px-4 py-2.5 text-xs text-slate-500">
            <span aria-live="polite">
              {loading
                ? 'Searching\u2026'
                : `${pagination.total.toLocaleString()} ${
                    pagination.total === 1 ? 'admission matches' : 'admissions match'
                  }`}
            </span>
            <span className="text-slate-300" aria-hidden="true">
              ·
            </span>
            <button
              type="button"
              onClick={clearFilters}
              className="font-semibold text-brand-700 transition-colors duration-200 hover:text-brand-800"
            >
              Clear filters
            </button>
          </div>
        )}
      </Card>

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
