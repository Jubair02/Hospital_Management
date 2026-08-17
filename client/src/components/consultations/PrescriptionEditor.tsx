import type { PrescriptionMedicine } from '../../types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Icon from '../ui/icons';
import useRowKeys from './useRowKeys';

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

const PLACEHOLDERS: Partial<Record<keyof PrescriptionMedicine, string>> = {
  medicineName: 'Amoxicillin 500mg',
  dosage: '1 capsule',
  frequency: 'Three times daily',
  duration: '7 days',
  route: 'Oral, IV…',
  instructions: 'After food',
};

const emptyMedicine = (): PrescriptionMedicine => ({
  medicineName: '',
  dosage: '',
  frequency: '',
  duration: '',
  route: '',
  instructions: '',
});

/** Add/edit/remove prescribed medicines. */
export function PrescriptionEditor({ value, onChange }: PrescriptionEditorProps) {
  const rowKeys = useRowKeys(value.length);

  const update = (index: number, patch: Partial<PrescriptionMedicine>) =>
    onChange(value.map((m, i) => (i === index ? { ...m, ...patch } : m)));

  const remove = (index: number) => {
    rowKeys.removed(index);
    onChange(value.filter((_, i) => i !== index));
  };

  const add = () => {
    rowKeys.inserted();
    onChange([...value, emptyMedicine()]);
  };

  return (
    <div className="space-y-3">
      {value.length === 0 && <p className="text-sm text-slate-500">No medicines prescribed yet.</p>}

      {value.map((medicine, index) => (
        <fieldset key={rowKeys.keys[index]} className="rounded-xl border border-line p-3.5">
          <legend className="px-1 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Medicine {index + 1}
          </legend>

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
                placeholder={PLACEHOLDERS[key]}
                value={medicine[key] ?? ''}
                onChange={(e) => update(index, { [key]: e.target.value })}
              />
            ))}
          </div>

          <div className="mt-3 flex justify-end">
            <Button variant="dangerGhost" size="sm" onClick={() => remove(index)}>
              <Icon name="x" className="h-3.5 w-3.5" strokeWidth="2.2" />
              Remove medicine
            </Button>
          </div>
        </fieldset>
      ))}

      <Button variant="secondary" size="sm" onClick={add}>
        <Icon name="plus" className="h-3.5 w-3.5" strokeWidth="2.2" />
        Add medicine
      </Button>
    </div>
  );
}

/**
 * Read-only prescription table.
 *
 * A plain table rather than the shared `Table` component: this always renders
 * inside a card, and `Table` brings its own border, radius and shadow — two
 * nested surfaces drawing the same edge twice. Expects its card to be
 * `padded={false}`, so the rows run the full width of the surface, and carries
 * its own padding in the empty case.
 */
export function PrescriptionList({ prescriptions }: { prescriptions: PrescriptionMedicine[] }) {
  if (prescriptions.length === 0) {
    return <p className="p-5 text-sm text-slate-500">No medicines prescribed.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-slate-50/80 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-slate-500">
            <th scope="col" className="px-5 py-3 text-left">
              Medicine
            </th>
            <th scope="col" className="px-3 py-3 text-left">
              Dosage
            </th>
            <th scope="col" className="px-3 py-3 text-left">
              Frequency
            </th>
            <th scope="col" className="px-3 py-3 text-left">
              Duration
            </th>
            <th scope="col" className="px-3 py-3 text-left">
              Route
            </th>
            <th scope="col" className="px-5 py-3 text-left">
              Instructions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {prescriptions.map((medicine, index) => (
            <tr key={`${medicine.medicineName}-${index}`}>
              <td className="px-5 py-3.5 font-medium text-slate-800">{medicine.medicineName}</td>
              <td className="px-3 py-3.5 text-slate-700">{medicine.dosage}</td>
              <td className="px-3 py-3.5 text-slate-700">{medicine.frequency}</td>
              <td className="px-3 py-3.5 text-slate-700">{medicine.duration}</td>
              <td className="px-3 py-3.5 text-slate-700">
                {medicine.route || <span className="text-slate-400">—</span>}
              </td>
              <td className="px-5 py-3.5 text-pretty text-slate-700">
                {medicine.instructions || <span className="text-slate-400">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
