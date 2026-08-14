import type { Department, Doctor } from '../../types';
import Input from '../ui/Input';
import Select, { type SelectOption } from '../ui/Select';

export type DatePreset = '' | 'today' | 'tomorrow' | 'week' | 'custom';

export interface AppointmentFilterValues {
  status: string;
  doctorId: string;
  departmentId: string;
  datePreset: DatePreset;
  customDate: string;
}

const STATUS_OPTIONS: SelectOption[] = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No show' },
];

const DATE_OPTIONS: SelectOption[] = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'week', label: 'This week' },
  { value: 'custom', label: 'Custom date' },
];

/** Converts a date preset into API dateFrom/dateTo params. */
export const presetToRange = (
  preset: DatePreset,
  customDate: string
): { dateFrom?: string; dateTo?: string } => {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date();

  switch (preset) {
    case 'today':
      return { dateFrom: iso(today), dateTo: iso(today) };
    case 'tomorrow': {
      const t = new Date(today);
      t.setDate(t.getDate() + 1);
      return { dateFrom: iso(t), dateTo: iso(t) };
    }
    case 'week': {
      const end = new Date(today);
      end.setDate(end.getDate() + 6);
      return { dateFrom: iso(today), dateTo: iso(end) };
    }
    case 'custom':
      return customDate ? { dateFrom: customDate, dateTo: customDate } : {};
    default:
      return {};
  }
};

interface AppointmentFiltersProps {
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  filters: AppointmentFilterValues;
  onFiltersChange: (filters: AppointmentFilterValues) => void;
  doctors: Doctor[];
  departments: Department[];
  /** Doctors viewing their own list don't need the doctor filter. */
  showDoctorFilter?: boolean;
}

export default function AppointmentFilters({
  searchInput,
  onSearchInputChange,
  filters,
  onFiltersChange,
  doctors,
  departments,
  showDoctorFilter = true,
}: AppointmentFiltersProps) {
  const set = (patch: Partial<AppointmentFilterValues>) =>
    onFiltersChange({ ...filters, ...patch });

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <Input
        placeholder="Search by ID, patient, doctor…"
        value={searchInput}
        onChange={(e) => onSearchInputChange(e.target.value)}
        aria-label="Search appointments"
        className="lg:col-span-2"
      />
      <Select
        aria-label="Filter by date"
        value={filters.datePreset}
        onChange={(e) => set({ datePreset: e.target.value as DatePreset })}
        options={DATE_OPTIONS}
        placeholder="Any date"
      />
      {filters.datePreset === 'custom' && (
        <Input
          type="date"
          value={filters.customDate}
          onChange={(e) => set({ customDate: e.target.value })}
          aria-label="Custom date"
        />
      )}
      {showDoctorFilter && (
        <Select
          aria-label="Filter by doctor"
          value={filters.doctorId}
          onChange={(e) => set({ doctorId: e.target.value })}
          options={doctors.map((d) => ({
            value: d._id,
            label: `Dr. ${d.firstName} ${d.lastName}`,
          }))}
          placeholder="All doctors"
        />
      )}
      <Select
        aria-label="Filter by department"
        value={filters.departmentId}
        onChange={(e) => set({ departmentId: e.target.value })}
        options={departments.map((d) => ({ value: d._id, label: d.name }))}
        placeholder="All departments"
      />
      <Select
        aria-label="Filter by status"
        value={filters.status}
        onChange={(e) => set({ status: e.target.value })}
        options={STATUS_OPTIONS}
        placeholder="All statuses"
      />
    </div>
  );
}
