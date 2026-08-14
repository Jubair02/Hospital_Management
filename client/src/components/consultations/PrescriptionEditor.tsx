import type { PrescriptionMedicine } from '../../types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Table, { type Column } from '../ui/Table';

interface PrescriptionEditorProps {
  value: PrescriptionMedicine[];
  onChange: (value: PrescriptionMedicine[]) => void;
}

const FIELDS: Array<{ key: keyof PrescriptionMedicine; label: string; required?: boolean }> = [
  { key: 'medicineName', label: 'Medicine', required: true },
  { key: 'dosage', label: 'Dosage', required: true },
  { key: 'frequency', label: 'Frequency', required: true },
  { key: 'duration', label: 'Duration', required: true },
  { key: 'route', label: 'Route' },
  { key: 'instructions', label: 'Instructions' },
];

/** Add/edit/remove prescribed medicines. */
export function PrescriptionEditor({ value, onChange }: PrescriptionEditorProps) {
  const update = (index: number, patch: Partial<PrescriptionMedicine>) =>
    onChange(value.map((m, i) => (i === index ? { ...m, ...patch } : m)));

  return (
    <div className="space-y-3">
      {value.length === 0 && (
        <p className="text-sm text-slate-400">No medicines prescribed yet.</p>
      )}

      {value.map((medicine, index) => (
        <div key={index} className="rounded-lg border border-slate-200 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FIELDS.map(({ key, label, required }) => (
              <Input
                key={key}
                label={
                  required ? (
                    <>
                      {label}
                      <span aria-hidden="true" className="text-rose-500"> *</span>
                    </>
                  ) : (
                    label
                  )
                }
                placeholder={key === 'route' ? 'Oral, IV…' : undefined}
                value={medicine[key] ?? ''}
                onChange={(e) => update(index, { [key]: e.target.value })}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              Remove medicine
            </Button>
          </div>
        </div>
      ))}

      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          onChange([
            ...value,
            { medicineName: '', dosage: '', frequency: '', duration: '', route: '', instructions: '' },
          ])
        }
      >
        + Add medicine
      </Button>
    </div>
  );
}

/** Read-only prescription table. */
export function PrescriptionList({ prescriptions }: { prescriptions: PrescriptionMedicine[] }) {
  if (prescriptions.length === 0) {
    return <p className="text-sm text-slate-400">No medicines prescribed.</p>;
  }

  const columns: Column<PrescriptionMedicine & { _id?: string }>[] = [
    {
      key: 'medicineName',
      header: 'Medicine',
      render: (m) => <span className="font-medium text-slate-800">{m.medicineName}</span>,
    },
    { key: 'dosage', header: 'Dosage' },
    { key: 'frequency', header: 'Frequency' },
    { key: 'duration', header: 'Duration' },
    {
      key: 'route',
      header: 'Route',
      render: (m) => m.route || <span className="text-slate-400">—</span>,
    },
    {
      key: 'instructions',
      header: 'Instructions',
      render: (m) => m.instructions || <span className="text-slate-400">—</span>,
    },
  ];

  return (
    <Table
      columns={columns}
      rows={prescriptions.map((p, i) => ({ ...p, id: String(i) }))}
    />
  );
}
