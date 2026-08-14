import Card from '../ui/Card';
import type { Patient } from '../../types';

function EntryList({ heading, entries, emptyText }: { heading: string; entries: string[]; emptyText: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700">{heading}</h3>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">{emptyText}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {entries.map((entry) => (
            <li key={entry} className="flex items-start gap-2 text-sm text-slate-700">
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
              {entry}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Allergies + basic medical history (kept simple by design in Phase 2). */
export default function MedicalHistoryCard({ patient }: { patient: Patient }) {
  return (
    <Card title="Medical information">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <EntryList
          heading="Allergies"
          entries={patient.allergies}
          emptyText="No known allergies recorded."
        />
        <EntryList
          heading="Medical history"
          entries={patient.medicalHistory}
          emptyText="No medical history recorded."
        />
      </div>
    </Card>
  );
}
