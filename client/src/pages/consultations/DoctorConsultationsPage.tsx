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
import Select from '../../components/ui/Select';
import Table, { type Column } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import ConsultationStatusBadge from '../../components/consultations/ConsultationStatusBadge';

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
      });
      setConsultations(data.consultations);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load consultations.'));
    } finally {
      setLoading(false);
    }
  }, [profile, page, status]);

  useEffect(() => {
    load();
  }, [load]);

  if (profileError) return <Alert tone="error">{profileError}</Alert>;
  if (!profile) return <FullPageSpinner label="Loading your consultations" />;

  const columns: Column<Consultation>[] = [
    {
      key: 'consultationId',
      header: 'ID',
      render: (c) => <span className="font-medium text-brand-800">{c.consultationId}</span>,
    },
    {
      key: 'date',
      header: 'Date',
      render: (c) => formatDate(c.consultationDate),
    },
    {
      key: 'patient',
      header: 'Patient',
      render: (c) =>
        c.patientId ? (
          <div>
            <p className="font-medium text-slate-800">
              {c.patientId.firstName} {c.patientId.lastName}
            </p>
            <p className="text-slate-500">{c.patientId.patientId}</p>
          </div>
        ) : (
          '—'
        ),
    },
    {
      key: 'diagnosis',
      header: 'Diagnosis',
      render: (c) =>
        c.diagnoses.length > 0 ? (
          c.diagnoses[0]!.diagnosis
        ) : (
          <span className="text-slate-400">—</span>
        ),
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
            <Link to={`/doctor/appointments/${c.appointmentId._id}/consultation`}>
              <Button size="sm">Continue</Button>
            </Link>
          ) : (
            <Link to={`/consultations/${c._id}`}>
              <Button variant="ghost" size="sm">
                View
              </Button>
            </Link>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">My consultations</h1>
        <p className="mt-1 text-sm text-slate-500">Clinical records you have authored.</p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <div className="mb-4 max-w-xs">
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
        </div>

        <Table
          columns={columns}
          rows={consultations}
          loading={loading}
          emptyState={
            <EmptyState
              title="No consultations yet"
              description="Start a consultation from one of your appointments."
              action={
                <Link to="/doctor/appointments">
                  <Button size="sm">My appointments</Button>
                </Link>
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
