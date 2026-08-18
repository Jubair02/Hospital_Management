import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  createConsultation,
  getConsultations,
  updateConsultation,
  updateConsultationStatus,
} from '../../services/consultationService';
import { getAppointmentById } from '../../services/appointmentService';
import { getPatientById } from '../../services/patientService';
import { getErrorMessage } from '../../services/api';
import { isAxiosError } from 'axios';
import { calculateAge, formatDate, localDay } from '../../utils/date';
import type {
  Appointment,
  Consultation,
  Diagnosis,
  Patient,
  PrescriptionMedicine,
  UpdateConsultationPayload,
} from '../../types';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import BackLink from '../../components/ui/BackLink';
import PageHeader from '../../components/ui/PageHeader';
import Textarea from '../../components/ui/Textarea';
import Input from '../../components/ui/Input';
import Icon from '../../components/ui/icons';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import ConsultationStatusBadge from '../../components/consultations/ConsultationStatusBadge';
import ConsultationHistoryCard from '../../components/consultations/ConsultationHistoryCard';
import LabOrdersCard from '../../components/laboratory/LabOrdersCard';
import LatestObservationBanner from '../../components/nursing/LatestObservationBanner';
import { DiagnosisEditor } from '../../components/consultations/DiagnosisEditor';
import { PrescriptionEditor } from '../../components/consultations/PrescriptionEditor';
import {
  VitalSignsFields,
  emptyVitals,
  validateVitals,
  vitalsToFormState,
  vitalsToPayload,
  type VitalSignsFormState,
} from '../../components/consultations/VitalSignsFields';

const APPOINTMENTS_PATH = '/doctor/appointments';

/**
 * Where leaving this page should go.
 *
 * The workbench is reached from three places — the appointments list, the
 * consultations queue, and a consultation's own record — but every exit used
 * to lead to the appointments list. Continuing a consultation therefore moved
 * you into a different section of the app and left you to find your way back.
 * The entry point travels in `location.state` and drives the back link, the
 * two fallback buttons, and the discard-and-leave redirect alike.
 */
export interface WorkbenchOrigin {
  to: string;
  label: string;
}

const DEFAULT_ORIGIN: WorkbenchOrigin = { to: APPOINTMENTS_PATH, label: 'My appointments' };

/** History state is same-origin, but only an in-app path is ever a valid exit. */
const readOrigin = (state: unknown): WorkbenchOrigin => {
  const candidate = (state as { origin?: WorkbenchOrigin } | null)?.origin;
  if (!candidate?.to?.startsWith('/') || candidate.to.startsWith('//') || !candidate.label) {
    return DEFAULT_ORIGIN;
  }
  return candidate;
};

interface ClinicalFormState {
  chiefComplaint: string;
  historyOfPresentIllness: string;
  physicalExamination: string;
  clinicalNotes: string;
  assessment: string;
  treatmentPlan: string;
  followUpDate: string;
}

const emptyClinical: ClinicalFormState = {
  chiefComplaint: '',
  historyOfPresentIllness: '',
  physicalExamination: '',
  clinicalNotes: '',
  assessment: '',
  treatmentPlan: '',
  followUpDate: '',
};

const clinicalFromConsultation = (c: Consultation): ClinicalFormState => ({
  chiefComplaint: c.chiefComplaint ?? '',
  historyOfPresentIllness: c.historyOfPresentIllness ?? '',
  physicalExamination: c.physicalExamination ?? '',
  clinicalNotes: c.clinicalNotes ?? '',
  assessment: c.assessment ?? '',
  treatmentPlan: c.treatmentPlan ?? '',
  followUpDate: c.followUpDate ? c.followUpDate.slice(0, 10) : '',
});

const isEmptyMedicine = (m: PrescriptionMedicine): boolean =>
  !m.medicineName.trim() && !m.dosage.trim() && !m.frequency.trim() && !m.duration.trim();

const isCompleteMedicine = (m: PrescriptionMedicine): boolean =>
  Boolean(m.medicineName.trim() && m.dosage.trim() && m.frequency.trim() && m.duration.trim());

/** Everything the record holds, as one comparable string. */
const snapshotOf = (
  form: ClinicalFormState,
  vitals: VitalSignsFormState,
  diagnoses: Diagnosis[],
  prescriptions: PrescriptionMedicine[]
): string => JSON.stringify({ form, vitals, diagnoses, prescriptions });

/**
 * The doctor's clinical workbench for one appointment: start the
 * consultation, document the visit, save progress, and complete it.
 *
 * Laid out as form-plus-rail rather than one tall column. The rail carries the
 * two things a doctor has to keep glancing at — who is in the room (and what
 * they are allergic to) and what the record still needs before it can be
 * locked — while the pinned bar keeps saving one reach away from wherever the
 * cursor is.
 */
export default function ConsultationWorkbenchPage() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const navigate = useNavigate();
  const origin = readOrigin(useLocation().state);

  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [form, setForm] = useState<ClinicalFormState>(emptyClinical);
  const [vitals, setVitals] = useState<VitalSignsFormState>(emptyVitals);
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionMedicine[]>([]);
  /** The record as last persisted, for comparison against what is on screen. */
  const [savedSnapshot, setSavedSnapshot] = useState('');

  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const hydrate = (c: Consultation) => {
    const nextForm = clinicalFromConsultation(c);
    const nextVitals = vitalsToFormState(c.vitalSigns);

    setConsultation(c);
    setForm(nextForm);
    setVitals(nextVitals);
    setDiagnoses(c.diagnoses ?? []);
    setPrescriptions(c.prescriptions ?? []);
    setSavedSnapshot(snapshotOf(nextForm, nextVitals, c.diagnoses, c.prescriptions));
  };

  const load = useCallback(async () => {
    if (!appointmentId) return;
    setLoading(true);
    setLoadError('');
    try {
      const [apt, existing] = await Promise.all([
        getAppointmentById(appointmentId),
        getConsultations({ appointmentId, limit: 5 }),
      ]);
      setAppointment(apt);

      if (apt.patientId) {
        setPatient(await getPatientById(apt.patientId._id));
      }

      // An appointment can now carry a cancelled attempt alongside the live
      // record, so the newest is not necessarily the right one to open.
      const found = existing.consultations.find((c) => c.status !== 'cancelled');
      if (found) hydrate(found);
    } catch (err) {
      setLoadError(getErrorMessage(err, 'Unable to load this appointment.'));
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty =
    Boolean(consultation) && snapshotOf(form, vitals, diagnoses, prescriptions) !== savedSnapshot;

  /**
   * A reload, a closed tab, or a click on the browser's back button while a
   * visit is half documented. The in-app exits are guarded separately below;
   * this is the one the app cannot intercept any other way.
   */
  useEffect(() => {
    if (!dirty) return undefined;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers need the assignment; the string itself is never shown.
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const handleStart = async () => {
    if (!appointmentId) return;
    setStarting(true);
    setActionError('');
    try {
      hydrate(await createConsultation(appointmentId));
      // Starting confirms the appointment server-side; mirror it so the badge
      // on this page does not keep reading "Scheduled" after the fact.
      setAppointment((current) =>
        current && current.status === 'scheduled' ? { ...current, status: 'confirmed' } : current
      );
      setNotice('Consultation started.');
    } catch (err) {
      setActionError(getErrorMessage(err, 'Unable to start the consultation.'));
      // A record already exists — another tab, or one this page failed to open
      // earlier. Reload into it rather than leaving the doctor at a dead end.
      if (isAxiosError(err) && err.response?.status === 409) await load();
    } finally {
      setStarting(false);
    }
  };

  /** Builds and validates the PATCH payload; returns null if invalid. */
  const buildPayload = (): UpdateConsultationPayload | null => {
    const vitalsProblem = validateVitals(vitals);
    if (vitalsProblem) {
      setActionError(vitalsProblem);
      return null;
    }

    const cleanDiagnoses = diagnoses.filter((d) => d.diagnosis.trim());
    if (diagnoses.some((d) => !d.diagnosis.trim() && (d.notes ?? '').trim())) {
      setActionError('Every diagnosis needs its text — complete or remove the empty row.');
      return null;
    }

    const nonEmptyMedicines = prescriptions.filter((m) => !isEmptyMedicine(m));
    if (nonEmptyMedicines.some((m) => !isCompleteMedicine(m))) {
      setActionError(
        'Each medicine needs name, dosage, frequency, and duration — complete or remove the row.'
      );
      return null;
    }

    return {
      chiefComplaint: form.chiefComplaint.trim(),
      historyOfPresentIllness: form.historyOfPresentIllness.trim(),
      physicalExamination: form.physicalExamination.trim(),
      clinicalNotes: form.clinicalNotes.trim(),
      assessment: form.assessment.trim(),
      treatmentPlan: form.treatmentPlan.trim(),
      vitalSigns: vitalsToPayload(vitals),
      diagnoses: cleanDiagnoses.map((d) => ({
        diagnosis: d.diagnosis.trim(),
        type: d.type,
        notes: d.notes?.trim() || undefined,
      })),
      prescriptions: nonEmptyMedicines.map((m) => ({
        medicineName: m.medicineName.trim(),
        dosage: m.dosage.trim(),
        frequency: m.frequency.trim(),
        duration: m.duration.trim(),
        route: m.route?.trim() || undefined,
        instructions: m.instructions?.trim() || undefined,
      })),
      ...(form.followUpDate ? { followUpDate: form.followUpDate } : {}),
    };
  };

  const handleSave = async (): Promise<boolean> => {
    if (!consultation) return false;
    setActionError('');
    setNotice('');

    const payload = buildPayload();
    if (!payload) return false;

    setSaving(true);
    try {
      hydrate(await updateConsultation(consultation._id, payload));
      setNotice('Progress saved.');
      return true;
    } catch (err) {
      setActionError(getErrorMessage(err, 'Unable to save the consultation.'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    if (!consultation) return;
    setCompleting(true);
    setActionError('');
    try {
      const saved = await handleSave();
      if (!saved) {
        setCompleteOpen(false);
        return;
      }
      const done = await updateConsultationStatus(consultation._id, 'completed');
      navigate(`/consultations/${done._id}`, {
        state: { flash: `Consultation ${done.consultationId} completed.` },
      });
    } catch (err) {
      setActionError(getErrorMessage(err, 'Unable to complete the consultation.'));
      setCompleteOpen(false);
    } finally {
      setCompleting(false);
    }
  };

  /** Ask before walking away from typing that has not been saved. */
  const guardLeaving = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!dirty) return;
    event.preventDefault();
    setLeaveOpen(true);
  };

  if (loading) return <FullPageSpinner label="Loading consultation" />;

  if (!appointment) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-10 text-center">
        <Alert tone="error">{loadError || 'This appointment could not be found.'}</Alert>
        <Link to={origin.to}>
          <Button variant="secondary">Back to {origin.label.toLowerCase()}</Button>
        </Link>
      </div>
    );
  }

  // A finished consultation lives on its read-only page.
  if (consultation && consultation.status !== 'in_progress') {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-10 text-center">
        <Alert tone="info">
          This appointment's consultation is {consultation.status.replace('_', ' ')} and read-only.
        </Alert>
        <Link to={`/consultations/${consultation._id}`}>
          <Button>Open consultation record</Button>
        </Link>
      </div>
    );
  }

  const required = <span aria-hidden="true" className="text-rose-500"> *</span>;

  /**
   * What the server insists on before it will lock a record — same four checks,
   * same wording, so the answer is the same on both sides of the wire (see
   * COMPLETION_REQUIREMENTS in server/services/consultationService.ts).
   */
  const requirements: Array<{ label: string; met: boolean }> = [
    { label: 'Chief complaint', met: Boolean(form.chiefComplaint.trim()) },
    { label: 'Assessment', met: Boolean(form.assessment.trim()) },
    { label: 'At least one diagnosis', met: diagnoses.some((d) => d.diagnosis.trim()) },
    { label: 'Treatment plan', met: Boolean(form.treatmentPlan.trim()) },
  ];
  const missing = requirements.filter((item) => !item.met);

  const patientName = patient ? `${patient.firstName} ${patient.lastName}` : null;
  const busy = saving || completing || starting;

  /**
   * The server opens a record for a scheduled or confirmed appointment and no
   * other. Offering the button on the rest only produced a rejection the doctor
   * had to read to understand, so the reason is stated up front instead.
   */
  const canStart = appointment.status === 'scheduled' || appointment.status === 'confirmed';
  const blockedReason: Record<string, string> = {
    completed: 'This appointment is already closed. Its consultation record cannot be reopened.',
    cancelled: 'This appointment was cancelled, so there is no visit to document.',
    no_show: 'This patient was marked as a no-show. Reschedule to see them.',
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="space-y-3">
        <BackLink to={origin.to} label={origin.label} onClick={guardLeaving} />

        <PageHeader
          eyebrow="Consultation"
          title={patientName ?? 'Consultation'}
          subtitle={`${appointment.appointmentId} · ${formatDate(appointment.appointmentDate)} · ${
            appointment.startTime
          }–${appointment.endTime}`}
          meta={
            <>
              {consultation && <ConsultationStatusBadge status={consultation.status} />}
              {consultation && (
                <span className="text-xs tabular-nums text-slate-500">
                  {consultation.consultationId}
                </span>
              )}
              {patient && (
                <Link
                  to={`/patients/${patient._id}`}
                  className="text-xs font-semibold text-brand-700 transition-colors hover:text-brand-800 hover:underline"
                >
                  {patient.patientId}
                </Link>
              )}
            </>
          }
        />
      </div>

      {loadError && <Alert tone="error">{loadError}</Alert>}

      {/* Why the patient is here, as the desk recorded it when the appointment
          was made. It was captured for this moment and then shown everywhere
          except here, so the doctor had to go back to the appointment to read
          the one line written for them. */}
      {(appointment.reason || appointment.notes) && (
        <Card title="Booked for" icon="appointments">
          <dl className="space-y-4">
            {appointment.reason && (
              <div>
                <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Reason given
                </dt>
                <dd className="mt-1 text-pretty text-sm leading-relaxed text-slate-800">
                  {appointment.reason}
                </dd>
              </div>
            )}
            {appointment.notes && (
              <div>
                <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Notes from reception
                </dt>
                <dd className="mt-1 text-pretty text-sm leading-relaxed text-slate-600">
                  {appointment.notes}
                </dd>
              </div>
            )}
          </dl>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:items-start">
        {/* First on a phone: allergies and what the record still needs are read
            before anything is typed, not after scrolling past the whole form. */}
        <aside className="order-first space-y-6 lg:order-last lg:sticky lg:top-24">
          {patient && <PatientCard patient={patient} />}

          {consultation && (
            <Card title="Before it can be locked" icon="check">
              <ul className="space-y-2.5">
                {requirements.map((item) => (
                  <li key={item.label} className="flex items-center gap-2.5 text-sm">
                    <span
                      aria-hidden="true"
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                        item.met
                          ? 'bg-accent-600 text-white'
                          : 'bg-slate-100 text-slate-400 ring-1 ring-inset ring-line-strong'
                      }`}
                    >
                      {item.met ? (
                        <Icon name="check" className="h-3 w-3" strokeWidth="3" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      )}
                    </span>
                    <span className={item.met ? 'text-slate-500 line-through' : 'text-slate-800'}>
                      {item.label}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs leading-relaxed text-slate-500">
                Completing saves and locks the record. Everything else on this page is optional.
              </p>
            </Card>
          )}
        </aside>

        <div className="space-y-6">
          {!consultation ? (
            <Card title="Start consultation" icon="clipboard">
              <p className="text-pretty text-sm leading-relaxed text-slate-600">
                {canStart
                  ? 'Starting opens the clinical record for this visit and confirms the appointment. Only you can edit it, and nothing is locked until you complete it.'
                  : blockedReason[appointment.status]}
              </p>

              {/* The status strip that normally carries actionError only exists
                  once a consultation does — which is exactly what failed here.
                  Without this the button spun and the page looked unchanged. */}
              {actionError && (
                <Alert tone="error" className="mt-4">
                  {actionError}
                </Alert>
              )}

              <div className="mt-4">
                {canStart ? (
                  <Button loading={starting} onClick={handleStart}>
                    {starting ? 'Starting…' : 'Start consultation'}
                  </Button>
                ) : (
                  <Link to={origin.to}>
                    <Button variant="secondary">Back to {origin.label.toLowerCase()}</Button>
                  </Link>
                )}
              </div>
            </Card>
          ) : (
            <>
              <Card title="Vital signs" subtitle="Every field optional" icon="activity">
                {/* What a nurse already measured, before the doctor measures
                    again. Copying is explicit — the doctor signs for whatever
                    ends up in their own record. */}
                {patient && (
                  <div className="mb-4">
                    <LatestObservationBanner patientId={patient._id} onUse={setVitals} />
                  </div>
                )}
                <VitalSignsFields value={vitals} onChange={setVitals} />
              </Card>

              <Card title="Clinical notes" icon="clipboard">
                <div className="space-y-4">
                  <Textarea
                    label={<>Chief complaint{required}</>}
                    value={form.chiefComplaint}
                    onChange={(e) => setForm((f) => ({ ...f, chiefComplaint: e.target.value }))}
                    rows={2}
                    placeholder="Patient reports persistent headache for three days."
                  />
                  <Textarea
                    label="History of present illness"
                    value={form.historyOfPresentIllness}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, historyOfPresentIllness: e.target.value }))
                    }
                    rows={3}
                  />
                  <Textarea
                    label="Physical examination"
                    value={form.physicalExamination}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, physicalExamination: e.target.value }))
                    }
                    rows={3}
                  />
                  <Textarea
                    label="Additional clinical notes"
                    value={form.clinicalNotes}
                    onChange={(e) => setForm((f) => ({ ...f, clinicalNotes: e.target.value }))}
                    rows={2}
                    hint="Optional"
                  />
                  <Textarea
                    label={<>Assessment{required}</>}
                    value={form.assessment}
                    onChange={(e) => setForm((f) => ({ ...f, assessment: e.target.value }))}
                    rows={3}
                  />
                </div>
              </Card>

              <Card
                title="Diagnosis"
                subtitle="At least one is required to complete"
                icon="flask"
              >
                <DiagnosisEditor value={diagnoses} onChange={setDiagnoses} />
              </Card>

              <Card title="Treatment plan" icon="check">
                <Textarea
                  label={<>Plan{required}</>}
                  value={form.treatmentPlan}
                  onChange={(e) => setForm((f) => ({ ...f, treatmentPlan: e.target.value }))}
                  rows={3}
                  placeholder="Treatment, lifestyle advice, follow-up instructions…"
                />
              </Card>

              <Card title="Prescription" icon="pill">
                <PrescriptionEditor value={prescriptions} onChange={setPrescriptions} />
              </Card>

              <LabOrdersCard consultationMongoId={consultation._id} />

              <Card title="Follow-up" icon="appointments">
                <Input
                  label="Follow-up date"
                  type="date"
                  // `localDay`, not `toISOString`: the latter converts to UTC
                  // first, which lets a night shift pick yesterday.
                  min={localDay()}
                  value={form.followUpDate}
                  onChange={(e) => setForm((f) => ({ ...f, followUpDate: e.target.value }))}
                  hint="Optional — no appointment is created automatically."
                  className="max-w-xs"
                />
              </Card>
            </>
          )}

          {patient && <ConsultationHistoryCard patientMongoId={patient._id} />}
        </div>
      </div>

      {/* Pinned to the bottom of the viewport: the form is taller than any
          screen, and both the state of the record and the way to save it have
          to be wherever the cursor already is. */}
      {consultation && (
        <div className="sticky bottom-0 -mx-1 px-1 pb-1 pt-2">
          <div className="surface-card flex flex-col gap-3 p-3 shadow-lg sm:flex-row sm:items-center sm:justify-between">
            <p
              aria-live="polite"
              className={`text-pretty text-xs leading-relaxed ${
                actionError
                  ? 'font-medium text-rose-700'
                  : notice
                    ? 'font-medium text-accent-700'
                    : dirty
                      ? 'font-medium text-amber-700'
                      : 'text-slate-500'
              }`}
            >
              {actionError ||
                notice ||
                (dirty
                  ? 'Unsaved changes.'
                  : missing.length > 0
                    ? `Still needed to complete: ${missing.map((m) => m.label.toLowerCase()).join(', ')}.`
                    : 'Saved. Ready to complete.')}
            </p>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                variant="secondary"
                className="w-full sm:w-auto"
                loading={saving}
                disabled={busy || !dirty}
                onClick={handleSave}
              >
                {saving ? 'Saving…' : 'Save progress'}
              </Button>
              <Button
                className="w-full sm:w-auto"
                disabled={busy || missing.length > 0}
                onClick={() => setCompleteOpen(true)}
              >
                Complete consultation
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={completeOpen}
        title="Complete consultation"
        confirmLabel="Complete"
        tone="primary"
        busy={completing}
        onConfirm={handleComplete}
        onCancel={() => setCompleteOpen(false)}
      >
        <p>
          The clinical record will be saved and locked. Completed consultations are read-only and
          cannot be edited afterwards.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={leaveOpen}
        title="Leave without saving?"
        confirmLabel="Discard changes"
        tone="danger"
        onConfirm={() => {
          setLeaveOpen(false);
          navigate(origin.to);
        }}
        onCancel={() => setLeaveOpen(false)}
      >
        <p>
          This visit has changes that have not been saved. Leaving now discards them — the record
          keeps whatever was last saved.
        </p>
      </ConfirmDialog>
    </div>
  );
}

/** Who is in the room, and the two things that change what may be prescribed. */
function PatientCard({ patient }: { patient: Patient }) {
  const facts = [
    `${patient.age ?? calculateAge(patient.dateOfBirth)} years`,
    patient.gender,
    patient.bloodGroup !== 'unknown' ? patient.bloodGroup : null,
  ].filter(Boolean) as string[];

  return (
    <Card title="Patient" icon="patients">
      <Link
        to={`/patients/${patient._id}`}
        className="text-[0.9375rem] font-semibold text-slate-900 transition-colors hover:text-brand-800"
      >
        {patient.firstName} {patient.lastName}
      </Link>
      <p className="mt-1 text-xs text-slate-500">
        <span className="tabular-nums">{patient.patientId}</span>
        {facts.length > 0 && <> · <span className="capitalize">{facts.join(' · ')}</span></>}
        {patient.phone && <> · <span className="tabular-nums">{patient.phone}</span></>}
      </p>

      <div className="mt-4 border-t border-line pt-3.5">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
          Allergies
        </p>
        {patient.allergies.length === 0 ? (
          <p className="mt-1.5 text-sm text-slate-500">None recorded</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {patient.allergies.map((allergy) => (
              <Badge key={allergy} tone="red">
                {allergy}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {patient.medicalHistory.length > 0 && (
        <div className="mt-4 border-t border-line pt-3.5">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
            History
          </p>
          <p className="mt-1.5 text-pretty text-sm leading-relaxed text-slate-700">
            {patient.medicalHistory.join(' · ')}
          </p>
        </div>
      )}
    </Card>
  );
}
