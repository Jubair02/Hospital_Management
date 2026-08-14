import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { getPatients } from '../../services/patientService';
import { getErrorMessage } from '../../services/api';
import { canCreatePatient } from '../../utils/permissions';
import type { Pagination as PaginationInfo, Patient } from '../../types';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import PatientTable from '../../components/patients/PatientTable';
import PatientFilters, {
  type PatientFilterValues,
} from '../../components/patients/PatientFilters';
import PageHeader from '../../components/ui/PageHeader';

const NO_FILTERS: PatientFilterValues = { gender: '', bloodGroup: '', status: '' };

/** Shared patient list for all roles; actions adapt to permissions. */
export default function PatientsListPage() {
  const { role } = useAuth();
  const location = useLocation();

  const [patients, setPatients] = useState<Patient[]>([]);
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
  const [filters, setFilters] = useState<PatientFilterValues>(NO_FILTERS);
  const [page, setPage] = useState(1);

  // Flash message forwarded from another page (e.g. after deactivation).
  const [flash] = useState<string>(() => (location.state as { flash?: string } | null)?.flash ?? '');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getPatients({
        page,
        limit: 10,
        search: search || undefined,
        gender: filters.gender || undefined,
        bloodGroup: filters.bloodGroup || undefined,
        status: filters.status || undefined,
      });
      setPatients(data.patients);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load patients.'));
    } finally {
      setLoading(false);
    }
  }, [page, search, filters]);

  useEffect(() => {
    load();
  }, [load]);

  // Debounce free-text search back to page 1.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const hasFilters = Boolean(search || filters.gender || filters.bloodGroup || filters.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Patients"
        subtitle={canCreatePatient(role) ? 'Register new patients and manage existing records.' : 'Look up patient records.'}
        actions={
          <>
            {canCreatePatient(role) && (
              <Link to={`/${role}/patients/new`}>
                <Button>Register patient</Button>
              </Link>
            )}
          </>
        }
      />

      {flash && <Alert tone="success">{flash}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <div className="mb-4">
          <PatientFilters
            searchInput={searchInput}
            onSearchInputChange={setSearchInput}
            filters={filters}
            onFiltersChange={(next) => {
              setFilters(next);
              setPage(1);
            }}
          />
        </div>

        <PatientTable
          patients={patients}
          loading={loading}
          emptyState={
            <EmptyState
              title="No patients found"
              description={
                hasFilters
                  ? 'Try changing your search or filter.'
                  : 'Register the first patient to get started.'
              }
              action={
                !hasFilters &&
                canCreatePatient(role) && (
                  <Link to={`/${role}/patients/new`}>
                    <Button size="sm">Register patient</Button>
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
