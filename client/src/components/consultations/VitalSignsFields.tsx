import type { VitalSigns } from '../../types';
import Input from '../ui/Input';

/** Vitals held as strings while editing; converted on save. */
export type VitalSignsFormState = Record<keyof VitalSigns, string>;

export const emptyVitals: VitalSignsFormState = {
  temperature: '',
  heartRate: '',
  bloodPressureSystolic: '',
  bloodPressureDiastolic: '',
  respiratoryRate: '',
  oxygenSaturation: '',
  weight: '',
  height: '',
};

export const vitalsFromConsultation = (vitals: VitalSigns): VitalSignsFormState => ({
  temperature: vitals.temperature?.toString() ?? '',
  heartRate: vitals.heartRate?.toString() ?? '',
  bloodPressureSystolic: vitals.bloodPressureSystolic?.toString() ?? '',
  bloodPressureDiastolic: vitals.bloodPressureDiastolic?.toString() ?? '',
  respiratoryRate: vitals.respiratoryRate?.toString() ?? '',
  oxygenSaturation: vitals.oxygenSaturation?.toString() ?? '',
  weight: vitals.weight?.toString() ?? '',
  height: vitals.height?.toString() ?? '',
});

/** Converts entered strings to numbers, dropping empty fields. */
export const vitalsToPayload = (form: VitalSignsFormState): VitalSigns => {
  const result: VitalSigns = {};
  for (const [key, value] of Object.entries(form) as Array<[keyof VitalSigns, string]>) {
    if (value.trim() !== '') {
      const num = Number(value);
      if (Number.isFinite(num)) result[key] = num;
    }
  }
  return result;
};

/** Client-side sanity check mirroring the backend rules. */
export const validateVitals = (form: VitalSignsFormState): string => {
  for (const [key, value] of Object.entries(form)) {
    if (value.trim() === '') continue;
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      return `${FIELD_LABELS[key as keyof VitalSigns]} must be a non-negative number.`;
    }
    if (key === 'oxygenSaturation' && (num < 0 || num > 100)) {
      return 'Oxygen saturation must be between 0 and 100.';
    }
  }
  return '';
};

const FIELD_LABELS: Record<keyof VitalSigns, string> = {
  temperature: 'Temperature (°C)',
  heartRate: 'Heart rate (bpm)',
  bloodPressureSystolic: 'BP systolic (mmHg)',
  bloodPressureDiastolic: 'BP diastolic (mmHg)',
  respiratoryRate: 'Respiratory rate (/min)',
  oxygenSaturation: 'O₂ saturation (%)',
  weight: 'Weight (kg)',
  height: 'Height (cm)',
};

interface VitalSignsFieldsProps {
  value: VitalSignsFormState;
  onChange: (value: VitalSignsFormState) => void;
}

/** Editable vitals grid — every field optional. */
export function VitalSignsFields({ value, onChange }: VitalSignsFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {(Object.keys(FIELD_LABELS) as Array<keyof VitalSigns>).map((key) => (
        <Input
          key={key}
          label={FIELD_LABELS[key]}
          type="number"
          inputMode="decimal"
          min={0}
          value={value[key]}
          onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        />
      ))}
    </div>
  );
}

/** Read-only vitals summary. */
export function VitalSignsCard({ vitals }: { vitals: VitalSigns }) {
  const entries = (Object.keys(FIELD_LABELS) as Array<keyof VitalSigns>).filter(
    (key) => vitals[key] !== undefined && vitals[key] !== null
  );

  if (entries.length === 0) {
    return <p className="text-sm text-slate-400">No vital signs recorded.</p>;
  }

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
      {entries.map((key) => (
        <div key={key}>
          <dt className="text-xs text-slate-500">{FIELD_LABELS[key]}</dt>
          <dd className="mt-0.5 text-sm font-semibold text-slate-800">{vitals[key]}</dd>
        </div>
      ))}
    </dl>
  );
}
