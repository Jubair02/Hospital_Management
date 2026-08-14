import useAuth from '../../hooks/useAuth';
import { canFilterPatients } from '../../utils/permissions';
import { BLOOD_GROUPS, GENDERS } from '../../types';
import Input from '../ui/Input';
import Select, { type SelectOption } from '../ui/Select';

const GENDER_OPTIONS: SelectOption[] = GENDERS.map((g) => ({
  value: g,
  label: g.charAt(0).toUpperCase() + g.slice(1),
}));

const BLOOD_GROUP_OPTIONS: SelectOption[] = BLOOD_GROUPS.map((bg) => ({
  value: bg,
  label: bg === 'unknown' ? 'Unknown' : bg,
}));

const STATUS_OPTIONS: SelectOption[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

export interface PatientFilterValues {
  gender: string;
  bloodGroup: string;
  status: string;
}

interface PatientFiltersProps {
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  filters: PatientFilterValues;
  onFiltersChange: (filters: PatientFilterValues) => void;
}

/**
 * Search box for every role; filter dropdowns only for roles allowed to
 * filter (nurses search only). Backend still authorizes every query.
 */
export default function PatientFilters({
  searchInput,
  onSearchInputChange,
  filters,
  onFiltersChange,
}: PatientFiltersProps) {
  const { role } = useAuth();
  const showFilters = canFilterPatients(role);

  const setFilter = (key: keyof PatientFilterValues) => (value: string) =>
    onFiltersChange({ ...filters, [key]: value });

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Input
        placeholder="Search by ID, name, phone, email…"
        value={searchInput}
        onChange={(e) => onSearchInputChange(e.target.value)}
        aria-label="Search patients"
        className="sm:col-span-2"
      />
      {showFilters && (
        <>
          <Select
            aria-label="Filter by gender"
            value={filters.gender}
            onChange={(e) => setFilter('gender')(e.target.value)}
            options={GENDER_OPTIONS}
            placeholder="All genders"
          />
          <Select
            aria-label="Filter by blood group"
            value={filters.bloodGroup}
            onChange={(e) => setFilter('bloodGroup')(e.target.value)}
            options={BLOOD_GROUP_OPTIONS}
            placeholder="All blood groups"
          />
          <Select
            aria-label="Filter by status"
            value={filters.status}
            onChange={(e) => setFilter('status')(e.target.value)}
            options={STATUS_OPTIONS}
            placeholder="All statuses"
          />
        </>
      )}
    </div>
  );
}
