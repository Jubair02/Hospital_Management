import type { Diagnosis, DiagnosisType } from '../../types';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';

const TYPE_OPTIONS = [
  { value: 'primary', label: 'Primary' },
  { value: 'secondary', label: 'Secondary' },
];

interface DiagnosisEditorProps {
  value: Diagnosis[];
  onChange: (value: Diagnosis[]) => void;
}

/** Add/edit/remove diagnoses (primary/secondary). */
export function DiagnosisEditor({ value, onChange }: DiagnosisEditorProps) {
  const update = (index: number, patch: Partial<Diagnosis>) =>
    onChange(value.map((d, i) => (i === index ? { ...d, ...patch } : d)));

  return (
    <div className="space-y-3">
      {value.length === 0 && (
        <p className="text-sm text-slate-400">No diagnoses added yet.</p>
      )}

      {value.map((entry, index) => (
        <div
          key={index}
          className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_10rem_1fr_auto]"
        >
          <Input
            aria-label={`Diagnosis ${index + 1}`}
            placeholder="Diagnosis"
            value={entry.diagnosis}
            onChange={(e) => update(index, { diagnosis: e.target.value })}
          />
          <Select
            aria-label={`Diagnosis ${index + 1} type`}
            value={entry.type}
            onChange={(e) => update(index, { type: e.target.value as DiagnosisType })}
            options={TYPE_OPTIONS}
          />
          <Input
            aria-label={`Diagnosis ${index + 1} notes`}
            placeholder="Notes (optional)"
            value={entry.notes ?? ''}
            onChange={(e) => update(index, { notes: e.target.value })}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            Remove
          </Button>
        </div>
      ))}

      <Button
        variant="secondary"
        size="sm"
        onClick={() => onChange([...value, { diagnosis: '', type: 'primary' }])}
      >
        + Add diagnosis
      </Button>
    </div>
  );
}

/** Read-only diagnosis list. */
export function DiagnosisList({ diagnoses }: { diagnoses: Diagnosis[] }) {
  if (diagnoses.length === 0) {
    return <p className="text-sm text-slate-400">No diagnoses recorded.</p>;
  }

  return (
    <ul className="space-y-2">
      {diagnoses.map((d, index) => (
        <li key={index} className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={d.type === 'primary' ? 'brand' : 'slate'}>
            {d.type === 'primary' ? 'Primary' : 'Secondary'}
          </Badge>
          <span className="font-medium text-slate-800">{d.diagnosis}</span>
          {d.notes && <span className="text-slate-500">— {d.notes}</span>}
        </li>
      ))}
    </ul>
  );
}
