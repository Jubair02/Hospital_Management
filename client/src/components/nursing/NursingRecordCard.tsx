import { useState } from 'react';
import {
  getAdministrations,
  getNursingNotes,
  getObservations,
} from '../../services/nursingService';
import useNursingFeed from '../../hooks/useNursingFeed';
import { relativeTime } from '../../utils/date';
import type {
  AdministrationStatus,
  MedicationAdministration,
  NursingNote,
  Observation,
  VitalSigns,
} from '../../types';
import Badge, { type BadgeTone } from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import Icon from '../ui/icons';
import RecordObservationModal from './RecordObservationModal';
import RecordAdministrationModal from './RecordAdministrationModal';
import AddNursingNoteModal from './AddNursingNoteModal';
import VitalTrend from './VitalTrend';

type Panel = 'observations' | 'medications' | 'notes';

const PANELS: { key: Panel; label: string }[] = [
  { key: 'observations', label: 'Observations' },
  { key: 'medications', label: 'Medications' },
  { key: 'notes', label: 'Notes' },
];

const STATUS_TONE: Record<AdministrationStatus, BadgeTone> = {
  given: 'green',
  refused: 'red',
  held: 'amber',
};

/** Short labels and units, in the order a chart is read. */
const VITAL_ROWS: { key: keyof VitalSigns; label: string; unit: string }[] = [
  { key: 'temperature', label: 'Temp', unit: '°C' },
  { key: 'heartRate', label: 'HR', unit: 'bpm' },
  { key: 'respiratoryRate', label: 'RR', unit: '/min' },
  { key: 'oxygenSaturation', label: 'SpO2', unit: '%' },
  { key: 'weight', label: 'Weight', unit: 'kg' },
  { key: 'height', label: 'Height', unit: 'cm' },
];

const summariseVitals = (vitals: VitalSigns | undefined): string => {
  if (!vitals) return '';

  const parts = VITAL_ROWS.filter((row) => vitals[row.key] !== undefined).map(
    (row) => `${row.label} ${vitals[row.key]}${row.unit}`
  );

  // Blood pressure reads as one figure or not at all.
  const { bloodPressureSystolic: systolic, bloodPressureDiastolic: diastolic } = vitals;
  if (systolic !== undefined && diastolic !== undefined) {
    parts.splice(1, 0, `BP ${systolic}/${diastolic}`);
  }

  return parts.join(' · ');
};

interface NursingRecordCardProps {
  patientId: string;
  patientName?: string;
  /** False for readers — doctors reviewing a stay, or a nurse off this ward. */
  canWrite?: boolean;
}

/**
 * The bedside record for one patient.
 *
 * Three feeds answering three different questions — what the numbers are
 * doing, what has been given, and what happened — kept together because they
 * are read together at a bedside, and because until now none of them existed
 * anywhere. Newest first throughout: the last entry is almost always the one
 * being looked for.
 */
export default function NursingRecordCard({
  patientId,
  patientName,
  canWrite = false,
}: NursingRecordCardProps) {
  const [panel, setPanel] = useState<Panel>('observations');
  const [recording, setRecording] = useState<Panel | null>(null);

  const observations = useNursingFeed<Observation>(
    () => getObservations({ patientId, limit: 20 }).then((data) => data.observations),
    [patientId]
  );
  const medications = useNursingFeed<MedicationAdministration>(
    () => getAdministrations({ patientId, limit: 20 }).then((data) => data.administrations),
    [patientId]
  );
  const notes = useNursingFeed<NursingNote>(
    () => getNursingNotes({ patientId, limit: 20 }).then((data) => data.notes),
    [patientId]
  );

  const feed = { observations, medications, notes }[panel];

  const emptyTitle = {
    observations: 'No observations yet',
    medications: 'No doses recorded',
    notes: 'No notes yet',
  }[panel];

  return (
    <>
      <Card
        title="Nursing record"
        subtitle="Newest first"
        icon="activity"
        padded={false}
        actions={
          canWrite ? (
            <Button size="sm" onClick={() => setRecording(panel)}>
              <Icon name="plus" className="h-3.5 w-3.5" strokeWidth="2.4" />
              Record
            </Button>
          ) : undefined
        }
      >
        <div
          role="tablist"
          aria-label="Nursing record"
          className="flex gap-1 border-b border-line px-4 pb-3 pt-1"
        >
          {PANELS.map((entry) => {
            const active = entry.key === panel;
            return (
              <button
                key={entry.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setPanel(entry.key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                  active
                    ? 'bg-accent-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {entry.label}
              </button>
            );
          })}
        </div>

        <div className="px-4 py-3">
          {feed.error ? (
            <p className="py-8 text-center text-sm text-slate-500">{feed.error}</p>
          ) : feed.items === null ? (
            <ul className="space-y-2" aria-label="Loading the nursing record">
              {[0, 1, 2].map((row) => (
                <li key={row} className="h-12 w-full rounded-xl skeleton" />
              ))}
            </ul>
          ) : feed.items.length === 0 ? (
            <EmptyState
              title={emptyTitle}
              description={
                canWrite
                  ? 'Record the first one and it appears here.'
                  : 'Nothing has been recorded for this patient.'
              }
            />
          ) : panel === 'observations' ? (
            <>
              <VitalTrend observations={feed.items as Observation[]} />
              <ul className="divide-y divide-line">
              {(feed.items as Observation[]).map((entry) => (
                <li key={entry._id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="text-sm font-medium tabular-nums text-slate-900">
                      {summariseVitals(entry.vitalSigns) || 'Note only'}
                    </p>
                    <p className="text-xs tabular-nums text-slate-500">
                      {relativeTime(entry.recordedAt)}
                    </p>
                  </div>
                  {entry.notes && (
                    <p className="mt-1 text-pretty text-xs leading-relaxed text-slate-600">
                      {entry.notes}
                    </p>
                  )}
                  <p className="mt-1 text-[0.6875rem] text-slate-400">
                    {entry.observationId}
                    {entry.recordedBy &&
                      ` · ${entry.recordedBy.firstName} ${entry.recordedBy.lastName}`}
                  </p>
                </li>
              ))}
              </ul>
            </>
          ) : panel === 'medications' ? (
            <ul className="divide-y divide-line">
              {(feed.items as MedicationAdministration[]).map((entry) => (
                <li key={entry._id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <p className="text-sm font-medium text-slate-900">
                      {entry.medicineName}{' '}
                      <span className="font-normal text-slate-600">{entry.dosage}</span>
                      {entry.route && (
                        <span className="font-normal text-slate-500"> · {entry.route}</span>
                      )}
                    </p>
                    <div className="flex items-center gap-2">
                      <Badge tone={STATUS_TONE[entry.status]}>{entry.status}</Badge>
                      <span className="text-xs tabular-nums text-slate-500">
                        {relativeTime(entry.administeredAt)}
                      </span>
                    </div>
                  </div>
                  {entry.notes && (
                    <p className="mt-1 text-pretty text-xs leading-relaxed text-slate-600">
                      {entry.notes}
                    </p>
                  )}
                  <p className="mt-1 text-[0.6875rem] text-slate-400">
                    {entry.administrationId}
                    {entry.administeredBy &&
                      ` · ${entry.administeredBy.firstName} ${entry.administeredBy.lastName}`}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="divide-y divide-line">
              {(feed.items as NursingNote[]).map((entry) => (
                <li key={entry._id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <div className="flex items-center gap-2">
                      <Badge tone={entry.category === 'handover' ? 'violet' : 'slate'}>
                        {entry.category}
                      </Badge>
                      {entry.shift && <span className="text-xs text-slate-500">{entry.shift}</span>}
                    </div>
                    <span className="text-xs tabular-nums text-slate-500">
                      {relativeTime(entry.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-pretty text-sm leading-relaxed text-slate-700">
                    {entry.body}
                  </p>
                  <p className="mt-1 text-[0.6875rem] text-slate-400">
                    {entry.noteId}
                    {entry.authorId &&
                      ` · ${entry.authorId.firstName} ${entry.authorId.lastName}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <RecordObservationModal
        open={recording === 'observations'}
        patientId={patientId}
        patientName={patientName}
        onClose={() => setRecording(null)}
        onRecorded={observations.reload}
      />
      <RecordAdministrationModal
        open={recording === 'medications'}
        patientId={patientId}
        patientName={patientName}
        onClose={() => setRecording(null)}
        onRecorded={medications.reload}
      />
      <AddNursingNoteModal
        open={recording === 'notes'}
        patientId={patientId}
        patientName={patientName}
        onClose={() => setRecording(null)}
        onAdded={notes.reload}
      />
    </>
  );
}
