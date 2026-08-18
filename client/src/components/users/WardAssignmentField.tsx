import { useEffect, useState } from 'react';
import { getWards } from '../../services/inpatientService';
import { getErrorMessage } from '../../services/api';
import type { Ward } from '../../types';

interface WardAssignmentFieldProps {
  value: string[];
  onChange: (wardIds: string[]) => void;
}

/**
 * The wards a nurse covers.
 *
 * Checkboxes rather than a multi-select: a hospital has few enough wards to
 * show them all, and the state that matters most — none selected — has to be
 * legible rather than looking like a control nobody has touched. Hence the
 * explicit line saying what "none" means, because it does not mean "no
 * access": an unassigned nurse keeps the hospital-wide view they had before
 * assignment existed, so nobody loses access the day this ships.
 */
export default function WardAssignmentField({ value, onChange }: WardAssignmentFieldProps) {
  const [wards, setWards] = useState<Ward[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    getWards({ limit: 100, status: 'active' })
      .then((data) => {
        if (!cancelled) setWards(data.wards);
      })
      .catch((err) => {
        if (!cancelled) {
          setWards([]);
          setError(getErrorMessage(err, 'Unable to load wards.'));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (wardId: string) => {
    onChange(
      value.includes(wardId) ? value.filter((id) => id !== wardId) : [...value, wardId]
    );
  };

  return (
    <fieldset className="rounded-xl border border-line p-3">
      <legend className="px-1 text-sm font-medium text-slate-700">Wards covered</legend>

      {error ? (
        <p className="text-sm text-slate-500">{error}</p>
      ) : wards === null ? (
        <div className="space-y-2" aria-label="Loading wards">
          {[0, 1].map((row) => (
            <div key={row} className="h-6 w-full rounded-lg skeleton" />
          ))}
        </div>
      ) : wards.length === 0 ? (
        <p className="text-sm text-slate-500">
          No wards exist yet. Create one under Inpatient to assign nurses to it.
        </p>
      ) : (
        <div className="grid max-h-44 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
          {wards.map((ward) => (
            <label
              key={ward._id}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 transition-colors duration-150 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={value.includes(ward._id)}
                onChange={() => toggle(ward._id)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="truncate">{ward.name}</span>
            </label>
          ))}
        </div>
      )}

      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        {value.length === 0
          ? 'None selected — this nurse can see and record for the whole hospital. Pick wards to narrow them to those patients.'
          : `Recording is limited to patients admitted to ${
              value.length === 1 ? 'this ward' : `these ${value.length} wards`
            }. Ward alerts go to them too.`}
      </p>
    </fieldset>
  );
}
