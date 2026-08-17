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
import ConsultationAction from '../../components/consultations/ConsultationAction';
import useLiveConsultations from '../../hooks/useLiveConsultations';
import AppointmentFilters, {
  presetToRange,
  type AppointmentFilterValues,
} from '../../components/appointments/AppointmentFilters';
import PageHeader from '../../components/ui/PageHeader';

const NO_FILTERS: AppointmentFilterValues = {
  status: '',
  doctorId: '',
  departmentId: '',
  datePreset: '',
  customDate: '',
};

/** Where the workbench returns a doctor who reached it from this list. */
const LIST_ORIGIN = { to: '/doctor/appointments', label: 'My appointments' };

/** Shared appointment list — doctors are automatically scoped server-side. */
export default function AppointmentsListPage() {
  const { role } = useAuth();
  const location = useLocation();
  const isDoctor = role === 'doctor';
  // Which of these rows already have a record open, so each offers the right
  // action. One request per visit, and only for the doctor's own view.
  const liveConsultations = useLiveConsultations(isDoctor);

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

  // Read from the live input rather than the debounced value, so the control
  // appears on the keystroke instead of 350ms later.
  const hasFilters = Boolean(
    searchInput || filters.status || filters.doctorId || filters.departmentId || filters.datePreset
  );

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setFilters(NO_FILTERS);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isDoctor ? 'My appointments' : 'Appointments'}
        subtitle={
          isDoctor ? 'Appointments assigned to you.' : 'Book and manage patient appointments.'
        }
        actions={
          canCreateAppointment(role) && (
            <Link to={`/${role}/appointments/new`}>
              <Button>Book appointment</Button>
            </Link>
          )
        }
      />

      {flash && <Alert tone="success">{flash}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      {/* Filters keep a card of their own. The table below brings its own
          border and shadow, so wrapping it in a second one drew every list
          screen with a double outline. */}
      <Card padded={false}>
        <div className="p-4">
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

        {/* Only once something is filtered: the pager cannot report this,
            because it hides itself when everything fits on one page. */}
        {hasFilters && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line bg-slate-50/60 px-4 py-2.5 text-xs text-slate-500">
            <span aria-live="polite">
              {loading
                ? 'Searching…'
                : `${pagination.total.toLocaleString()} ${
                    pagination.total === 1 ? 'appointment matches' : 'appointments match'
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

      <AppointmentTable
        appointments={appointments}
        loading={loading}
        showDoctor={!isDoctor}
        renderAction={
          isDoctor
            ? (appointment) => (
                <ConsultationAction
                  appointment={appointment}
                  live={liveConsultations}
                  origin={LIST_ORIGIN}
                />
              )
            : undefined
        }
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
              hasFilters ? (
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                canCreateAppointment(role) && (
                  <Link to={`/${role}/appointments/new`}>
                    <Button size="sm">Book appointment</Button>
                  </Link>
                )
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
