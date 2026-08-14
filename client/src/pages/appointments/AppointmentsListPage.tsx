import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { getAppointments } from '../../services/appointmentService';
import { getDoctors } from '../../services/doctorService';
import { getDepartments } from '../../services/departmentService';
import { getErrorMessage } from '../../services/api';
import { canCreateAppointment } from '../../utils/permissions';
import type {
  Appointment,
  Department,
  Doctor,
  Pagination as PaginationInfo,
} from '../../types';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import AppointmentTable from '../../components/appointments/AppointmentTable';
import AppointmentFilters, {
  presetToRange,
  type AppointmentFilterValues,
} from '../../components/appointments/AppointmentFilters';

const NO_FILTERS: AppointmentFilterValues = {
  status: '',
  doctorId: '',
  departmentId: '',
  datePreset: '',
  customDate: '',
};

/** Shared appointment list — doctors are automatically scoped server-side. */
export default function AppointmentsListPage() {
  const { role } = useAuth();
  const location = useLocation();
  const isDoctor = role === 'doctor';

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flash] = useState<string>(
    () => (location.state as { flash?: string } | null)?.flash ?? ''
  );

  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState<AppointmentFilterValues>(NO_FILTERS);
  const [page, setPage] = useState(1);

  useEffect(() => {
    getDepartments()
      .then(setDepartments)
      .catch(() => {});
    if (!isDoctor) {
      getDoctors({ limit: 100 })
        .then((data) => setDoctors(data.doctors))
        .catch(() => {});
    }
  }, [isDoctor]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const range = presetToRange(filters.datePreset, filters.customDate);
      const data = await getAppointments({
        page,
        limit: 10,
        search: search || undefined,
        status: filters.status || undefined,
        doctorId: filters.doctorId || undefined,
        departmentId: filters.departmentId || undefined,
        ...range,
      });
      setAppointments(data.appointments);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load appointments.'));
    } finally {
      setLoading(false);
    }
  }, [page, search, filters]);

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

  const hasFilters = Boolean(
    search || filters.status || filters.doctorId || filters.departmentId || filters.datePreset
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {isDoctor ? 'My appointments' : 'Appointments'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {isDoctor
              ? 'Appointments assigned to you.'
              : 'Book and manage patient appointments.'}
          </p>
        </div>
        {canCreateAppointment(role) && (
          <Link to={`/${role}/appointments/new`}>
            <Button>Book appointment</Button>
          </Link>
        )}
      </div>

      {flash && <Alert tone="success">{flash}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <div className="mb-4">
          <AppointmentFilters
            searchInput={searchInput}
            onSearchInputChange={setSearchInput}
            filters={filters}
            onFiltersChange={(next) => {
              setFilters(next);
              setPage(1);
            }}
            doctors={doctors}
            departments={departments}
            showDoctorFilter={!isDoctor}
          />
        </div>

        <AppointmentTable
          appointments={appointments}
          loading={loading}
          showDoctor={!isDoctor}
          emptyState={
            <EmptyState
              title="No appointments found"
              description={
                hasFilters
                  ? 'Try changing your search or filter.'
                  : isDoctor
                    ? 'You have no appointments yet.'
                    : 'Book the first appointment to get started.'
              }
              action={
                !hasFilters &&
                canCreateAppointment(role) && (
                  <Link to={`/${role}/appointments/new`}>
                    <Button size="sm">Book appointment</Button>
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
