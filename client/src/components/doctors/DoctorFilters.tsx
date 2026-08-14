import type { Department } from '../../types';
import Input from '../ui/Input';
import Select, { type SelectOption } from '../ui/Select';

export interface DoctorFilterValues {
  departmentId: string;
  specialization: string;
  status: string;
}

interface DoctorFiltersProps {
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  filters: DoctorFilterValues;
  onFiltersChange: (filters: DoctorFilterValues) => void;
  departments: Department[];
  specializations: string[];
  showStatusFilter?: boolean;
}

export default function DoctorFilters({
  searchInput,
  onSearchInputChange,
  filters,
  onFiltersChange,
  departments,
  specializations,
  showStatusFilter = true,
}: DoctorFiltersProps) {
  const departmentOptions: SelectOption[] = departments.map((d) => ({
    value: d._id,
    label: d.name,
  }));

  const specializationOptions: SelectOption[] = specializations.map((s) => ({
    value: s,
    label: s,
  }));

  const setFilter = (key: keyof DoctorFilterValues) => (value: string) =>
    onFiltersChange({ ...filters, [key]: value });

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Input
        placeholder="Search by ID, name, specialization…"
        value={searchInput}
        onChange={(e) => onSearchInputChange(e.target.value)}
        aria-label="Search doctors"
        className="sm:col-span-2"
      />
      <Select
        aria-label="Filter by department"
        value={filters.departmentId}
        onChange={(e) => setFilter('departmentId')(e.target.value)}
        options={departmentOptions}
        placeholder="All departments"
      />
      <Select
        aria-label="Filter by specialization"
        value={filters.specialization}
        onChange={(e) => setFilter('specialization')(e.target.value)}
        options={specializationOptions}
        placeholder="All specializations"
      />
      {showStatusFilter && (
        <Select
          aria-label="Filter by status"
          value={filters.status}
          onChange={(e) => setFilter('status')(e.target.value)}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
          placeholder="All statuses"
        />
      )}
    </div>
  );
}
