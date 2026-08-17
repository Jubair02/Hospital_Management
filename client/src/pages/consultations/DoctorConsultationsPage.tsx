import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMyDoctorProfile } from '../../services/doctorService';
import { getDoctorConsultations } from '../../services/consultationService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type { Consultation, Doctor, Pagination as PaginationInfo } from '../../types';
import Card from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Table, { type Column } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import ConsultationStatusBadge from '../../components/consultations/ConsultationStatusBadge';
import PageHeader from '../../components/ui/PageHeader';
import Icon from '../../components/ui/icons';

const STATUS_OPTIONS = [
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

/** The logged-in doctor's own consultations. */
export default function DoctorConsultationsPage() {
  const [profile, setProfile] = useState<Doctor | null>(null);
  const [profileError, setProfileError] = useState('');

  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    getMyDoctorProfile()
      .then(setProfile)
      .catch((err: unknown) =>
        setProfileError(getErrorMessage(err, 'No doctor profile is linked to your account.'))
      );
  }, []);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError('');
    try {
      const data = await getDoctorConsultations(profile._id, {
        page,
        limit: 10,
        status: status || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setConsultations(data.consultations);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load consultations.'));
    } finally {
      setLoading(false);
    }
  }, [profile, page, status, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = Boolean(status || dateFrom || dateTo);

  const clearFilters = () => {
    setStatus('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  // Deliberately no search box: this endpoint filters by status and date only,
  // and a field that cannot search is worse than no field at all.
  const header = (
    <PageHeader
      eyebrow="Clinical"
      title="My consultations"
      subtitle="Clinical records you have authored, newest first."
    />
  );

  if (profileError) {
    return (
      <div className="space-y-6">
        {header}
        <Alert tone="error">{profileError}</Alert>
      </div>
    );
  }

  if (!profile) return <FullPageSpinner label="Loading your consultations" />;

  const columns: Column<Consultation>[] = [
    {
      key: 'consultationId',
      header: 'Consultation',
      render: (c) => (
        <div className="min-w-0">
          <Link
            to={`/consultations/${c._id}`}
            className="font-semibold tabular-nums text-brand-800 transition-colors hover:text-brand-900 hover:underline"
          >
            {c.consultationId}
          </Link>
          <p className="mt-0.5 text-xs text-slate-500">{formatDate(c.consultationDate)}</p>
        </div>
      ),
    },
    {
      key: 'patient',
      header: 'Patient',
      render: (c) =>
        c.patientId ? (
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-800">
              {c.patientId.firstName} {c.patientId.lastName}
            </p>
            <p className="mt-0.5 text-xs tabular-nums text-slate-500">{c.patientId.patientId}</p>
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      key: 'diagnosis',
      header: 'Primary diagnosis',
      render: (c) => {
        const primary = c.diagnoses.find((d) => d.type === 'primary') ?? c.diagnoses[0];
        return primary ? (
          <span className="text-pretty text-slate-700">{primary.diagnosis}</span>
        ) : (
          <span className="text-slate-400">Not recorded</span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => <ConsultationStatusBadge status={c.status} />,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      render: (c) => (
        <div className="flex justify-end gap-2">
          {c.status === 'in_progress' && c.appointmentId ? (
            <Link
              to={`/doctor/appointments/${c.appointmentId._id}/consultation`}
              state={{ origin: { to: '/doctor/consultations', label: 'Consultations' } }}
            >
              <Button size="sm">Continue</Button>
            </Link>
          ) : (
            <Link to={`/consultations/${c._id}`}>
              <Button variant="ghost" size="sm">
                View
                <Icon name="chevronRight" className="h-3.5 w-3.5" strokeWidth="2.2" />
              </Button>
            </Link>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {header}

      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
          <Input
            type="date"
            aria-label="Seen from"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
          />
          <Input
            type="date"
            aria-label="Seen until"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
          />
        </div>

        {filtered && (
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3.5">
            <p className="text-xs text-slate-500" aria-live="polite">
              {loading
                ? 'Searching…'
                : `${pagination.total.toLocaleString()} matching record${
                    pagination.total === 1 ? '' : 's'
                  }`}
            </p>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        )}
      </Card>

      <Table
        columns={columns}
        rows={consultations}
        loading={loading}
        emptyState={
          <EmptyState
            title={filtered ? 'No records match these filters' : 'No consultations yet'}
            description={
              filtered
                ? 'Widen the dates, or clear the filters to see every record.'
                : 'Start a consultation from one of your appointments and it appears here.'
            }
            action={
              filtered ? (
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <Link to="/doctor/appointments">
                  <Button size="sm">My appointments</Button>
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
