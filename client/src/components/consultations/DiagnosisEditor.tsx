import type { Diagnosis, DiagnosisType } from '../../types';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Icon from '../ui/icons';
import useRowKeys from './useRowKeys';

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
  const rowKeys = useRowKeys(value.length);

  const update = (index: number, patch: Partial<Diagnosis>) =>
    onChange(value.map((d, i) => (i === index ? { ...d, ...patch } : d)));

  const remove = (index: number) => {
    rowKeys.removed(index);
    onChange(value.filter((_, i) => i !== index));
  };

  const add = () => {
    rowKeys.inserted();
    // Secondary once a primary exists: a record with two primaries is almost
    // always a mis-click rather than an intention.
    onChange([
      ...value,
      { diagnosis: '', type: value.some((d) => d.type === 'primary') ? 'secondary' : 'primary' },
    ]);
  };

  return (
    <div className="space-y-3">
      {value.length === 0 && <p className="text-sm text-slate-500">No diagnoses added yet.</p>}

      {value.map((entry, index) => (
        <div
          key={rowKeys.keys[index]}
          className="grid grid-cols-1 gap-3 rounded-xl border border-line p-3 sm:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1fr)_auto] sm:items-center"
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
          <button
            type="button"
            onClick={() => remove(index)}
            aria-label={`Remove diagnosis ${index + 1}`}
            className="grid h-10 w-10 shrink-0 place-items-center justify-self-end rounded-xl text-slate-400 transition-colors duration-200 hover:bg-rose-50 hover:text-rose-700"
          >
            <Icon name="x" className="h-4 w-4" strokeWidth="2.2" />
          </button>
        </div>
      ))}

      <Button variant="secondary" size="sm" onClick={add}>
        <Icon name="plus" className="h-3.5 w-3.5" strokeWidth="2.2" />
        Add diagnosis
      </Button>
    </div>
  );
}

/** Read-only diagnosis list. */
export function DiagnosisList({ diagnoses }: { diagnoses: Diagnosis[] }) {
  if (diagnoses.length === 0) {
    return <p className="text-sm text-slate-500">No diagnoses recorded.</p>;
  }

  return (
    <ul className="space-y-3">
      {diagnoses.map((d, index) => (
        <li key={`${d.diagnosis}-${index}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <Badge tone={d.type === 'primary' ? 'brand' : 'slate'}>
            {d.type === 'primary' ? 'Primary' : 'Secondary'}
          </Badge>
          <span className="text-sm font-medium text-slate-800">{d.diagnosis}</span>
          {d.notes && (
            <span className="text-pretty text-sm leading-relaxed text-slate-500">— {d.notes}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
