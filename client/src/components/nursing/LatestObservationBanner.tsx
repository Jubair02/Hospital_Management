import { useEffect, useState } from 'react';
import { getObservations } from '../../services/nursingService';
import { relativeTime } from '../../utils/date';
import type { Observation, VitalSigns } from '../../types';
import Button from '../ui/Button';
import Icon from '../ui/icons';
import { vitalsToFormState, type VitalSignsFormState } from '../consultations/VitalSignsFields';

const FIELDS: { key: keyof VitalSigns; label: string; unit: string }[] = [
  { key: 'temperature', label: 'Temp', unit: '°C' },
  { key: 'heartRate', label: 'HR', unit: 'bpm' },
  { key: 'respiratoryRate', label: 'RR', unit: '/min' },
  { key: 'oxygenSaturation', label: 'SpO2', unit: '%' },
];

interface LatestObservationBannerProps {
  patientId: string;
  /** Copies the nurse's reading into the consultation's own vitals fields. */
  onUse: (vitals: VitalSignsFormState) => void;
}

/**
 * The last set of observations a nurse recorded, shown while a doctor
 * documents a visit.
 *
 * Observations and consultation vitals are separate records — a nurse writes
 * one, a doctor the other — which meant a doctor opening a consultation could
 * not see the reading taken an hour earlier in the same building, and would
 * either ask for it again or take it again. This closes that without merging
 * the two: the nurse's record stays the nurse's, and copying it across is an
 * explicit act rather than a silent prefill, because the doctor is signing for
 * whatever ends up in their own record.
 */
export default function LatestObservationBanner({
  patientId,
  onUse,
}: LatestObservationBannerProps) {
  const [latest, setLatest] = useState<Observation | null>(null);

  useEffect(() => {
    let cancelled = false;

    getObservations({ patientId, limit: 1 })
      .then((data) => {
        if (!cancelled) setLatest(data.observations[0] ?? null);
      })
      // Nothing to show is the common case; a failure looks the same and must
      // not interrupt a consultation.
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [patientId]);

  if (!latest) return null;

  const vitals = latest.vitalSigns ?? {};
  const readings = FIELDS.filter((field) => vitals[field.key] !== undefined);
  const { bloodPressureSystolic: systolic, bloodPressureDiastolic: diastolic } = vitals;
  const hasBloodPressure = systolic !== undefined && diastolic !== undefined;

  if (readings.length === 0 && !hasBloodPressure) return null;

  return (
    <div className="rounded-xl border border-accent-200 bg-accent-50/60 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-accent-800">
          <Icon name="activity" className="h-3.5 w-3.5" strokeWidth="2.2" />
          Nurse observation · {relativeTime(latest.recordedAt)}
        </p>

        <Button variant="secondary" size="sm" onClick={() => onUse(vitalsToFormState(vitals))}>
          Copy into this consultation
        </Button>
      </div>

      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
        {hasBloodPressure && (
          <div className="flex items-baseline gap-1.5">
            <dt className="text-[0.6875rem] text-slate-500">BP</dt>
            <dd className="text-sm font-semibold tabular-nums text-slate-900">
              {systolic}/{diastolic}
              <span className="ml-0.5 text-[0.625rem] font-normal text-slate-400">mmHg</span>
            </dd>
          </div>
        )}
        {readings.map((field) => (
          <div key={field.key} className="flex items-baseline gap-1.5">
            <dt className="text-[0.6875rem] text-slate-500">{field.label}</dt>
            <dd className="text-sm font-semibold tabular-nums text-slate-900">
              {vitals[field.key]}
              <span className="ml-0.5 text-[0.625rem] font-normal text-slate-400">
                {field.unit}
              </span>
            </dd>
          </div>
        ))}
      </dl>

      {latest.notes && (
        <p className="mt-1.5 text-pretty text-xs leading-relaxed text-slate-600">{latest.notes}</p>
      )}

      {latest.recordedBy && (
        <p className="mt-1 text-[0.6875rem] text-slate-400">
          {latest.observationId} · {latest.recordedBy.firstName} {latest.recordedBy.lastName}
        </p>
      )}
    </div>
  );
}
