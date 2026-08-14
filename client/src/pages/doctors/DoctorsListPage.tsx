import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { getDoctors, getSpecializations, updateDoctorStatus } from '../../services/doctorService';
import { getDepartments } from '../../services/departmentService';
import { getErrorMessage } from '../../services/api';
import { canManageDoctors } from '../../utils/permissions';
import type { Department, Doctor, Pagination as PaginationInfo } from '../../types';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import DoctorTable from '../../components/doctors/DoctorTable';
import DoctorFilters, {
  type DoctorFilterValues,
} from '../../components/doctors/DoctorFilters';
import PageHeader from '../../components/ui/PageHeader';

const NO_FILTERS: DoctorFilterValues = { departmentId: '', specialization: '', status: '' };

/** Doctor directory — management actions for admin, read-only otherwise. */
export default function DoctorsListPage() {
  const { role } = useAuth();
  const manage = canManageDoctors(role);

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [specializations, setSpecializations] = useState<string[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState<DoctorFilterValues>(NO_FILTERS);
  const [page, setPage] = useState(1);

  const [confirmDoctor, setConfirmDoctor] = useState<Doctor | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getDepartments(), getSpecializations()])
      .then(([deps, specs]) => {
        setDepartments(deps);
        setSpecializations(specs);
      })
      .catch((err: unknown) => setError(getErrorMessage(err, 'Unable to load filters.')));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getDoctors({
        page,
        limit: 10,
        search: search || undefined,
        departmentId: filters.departmentId || undefined,
        specialization: filters.specialization || undefined,
        status: filters.status || undefined,
      });
      setDoctors(data.doctors);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load doctors.'));
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

  const flash = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(''), 4000);
  };

  const handleToggleStatus = async () => {
    if (!confirmDoctor) return;
    const doctor = confirmDoctor;
    setTogglingId(doctor._id);
    try {
      const updated = await updateDoctorStatus(
        doctor._id,
        doctor.status === 'active' ? 'inactive' : 'active'
      );
      setDoctors((list) => list.map((d) => (d._id === updated._id ? updated : d)));
      flash(
        `Dr. ${updated.firstName} ${updated.lastName} ${updated.status === 'active' ? 'activated' : 'deactivated'}.`
      );
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to update doctor status.'));
    } finally {
      setTogglingId(null);
      setConfirmDoctor(null);
    }
  };

  const hasFilters = Boolean(
    search || filters.departmentId || filters.specialization || filters.status
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Doctors"
        subtitle={manage ? 'Manage doctor profiles and availability.' : 'Hospital doctor directory.'}
        actions={
          <>
            {manage && (
              <Link to="/admin/doctors/new">
                <Button>Add doctor</Button>
              </Link>
            )}
          </>
        }
      />

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <div className="mb-4">
          <DoctorFilters
            searchInput={searchInput}
            onSearchInputChange={setSearchInput}
            filters={filters}
            onFiltersChange={(next) => {
              setFilters(next);
              setPage(1);
            }}
            departments={departments}
            specializations={specializations}
            showStatusFilter={manage}
          />
        </div>

        <DoctorTable
          doctors={doctors}
          loading={loading}
          togglingId={togglingId}
          onToggleStatus={manage ? setConfirmDoctor : undefined}
          emptyState={
            <EmptyState
              title="No doctors found"
              description={
                hasFilters
                  ? 'Try changing your search or filter.'
                  : 'Add the first doctor to get started.'
              }
              action={
                !hasFilters &&
                manage && (
                  <Link to="/admin/doctors/new">
                    <Button size="sm">Add doctor</Button>
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

      <ConfirmDialog
        open={Boolean(confirmDoctor)}
        title={confirmDoctor?.status === 'active' ? 'Deactivate doctor' : 'Activate doctor'}
        confirmLabel={confirmDoctor?.status === 'active' ? 'Deactivate' : 'Activate'}
        tone={confirmDoctor?.status === 'active' ? 'danger' : 'primary'}
        busy={Boolean(togglingId)}
        onConfirm={handleToggleStatus}
        onCancel={() => setConfirmDoctor(null)}
      >
        {confirmDoctor?.status === 'active' ? (
          <p>
            Dr. {confirmDoctor?.firstName} {confirmDoctor?.lastName} will stop appearing for new
            appointment bookings. Existing appointments are not changed.
          </p>
        ) : (
          <p>
            Dr. {confirmDoctor?.firstName} {confirmDoctor?.lastName} will become bookable again.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
