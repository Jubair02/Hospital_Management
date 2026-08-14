import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  createConsultation,
  getConsultations,
  updateConsultation,
  updateConsultationStatus,
} from '../../services/consultationService';
import { getAppointmentById } from '../../services/appointmentService';
import { getPatientById } from '../../services/patientService';
import { getErrorMessage } from '../../services/api';
import { calculateAge, formatDate } from '../../utils/date';
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
import Textarea from '../../components/ui/Textarea';
import Input from '../../components/ui/Input';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import ConsultationStatusBadge from '../../components/consultations/ConsultationStatusBadge';
import ConsultationHistoryCard from '../../components/consultations/ConsultationHistoryCard';
import LabOrdersCard from '../../components/laboratory/LabOrdersCard';
import { DiagnosisEditor } from '../../components/consultations/DiagnosisEditor';
import { PrescriptionEditor } from '../../components/consultations/PrescriptionEditor';
import {
  VitalSignsFields,
  emptyVitals,
  validateVitals,
  vitalsFromConsultation,
  vitalsToPayload,
  type VitalSignsFormState,
} from '../../components/consultations/VitalSignsFields';

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

/**
 * The doctor's clinical workbench for one appointment: start the
 * consultation, document the visit, save progress, and complete it.
 */
export default function ConsultationWorkbenchPage() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const navigate = useNavigate();

  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [form, setForm] = useState<ClinicalFormState>(emptyClinical);
  const [vitals, setVitals] = useState<VitalSignsFormState>(emptyVitals);
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionMedicine[]>([]);

  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completing, setCompleting] = useState(false);

  const hydrate = (c: Consultation) => {
    setConsultation(c);
    setForm(clinicalFromConsultation(c));
    setVitals(vitalsFromConsultation(c.vitalSigns));
    setDiagnoses(c.diagnoses);
    setPrescriptions(c.prescriptions);
  };

  const load = useCallback(async () => {
    if (!appointmentId) return;
    setLoading(true);
    setLoadError('');
    try {
      const [apt, existing] = await Promise.all([
        getAppointmentById(appointmentId),
        getConsultations({ appointmentId, limit: 1 }),
      ]);
      setAppointment(apt);

      if (apt.patientId) {
        setPatient(await getPatientById(apt.patientId._id));
      }

      const found = existing.consultations[0];
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

  const handleStart = async () => {
    if (!appointmentId) return;
    setStarting(true);
    setActionError('');
    try {
      hydrate(await createConsultation(appointmentId));
      setNotice('Consultation started.');
    } catch (err) {
      setActionError(getErrorMessage(err, 'Unable to start the consultation.'));
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

  if (loading) return <FullPageSpinner label="Loading consultation" />;

  if (!appointment) {
    return (
      <div className="space-y-4">
        <Alert tone="error">{loadError || 'Appointment not found.'}</Alert>
        <Link to="/doctor/appointments">
          <Button variant="secondary">Back to my appointments</Button>
        </Link>
      </div>
    );
  }

  // A finished consultation lives on its read-only page.
  if (consultation && consultation.status !== 'in_progress') {
    return (
      <div className="space-y-4">
        <Alert tone="info">
          This appointment's consultation is {consultation.status.replace('_', ' ')}.
        </Alert>
        <Link to={`/consultations/${consultation._id}`}>
          <Button>Open consultation record</Button>
        </Link>
      </div>
    );
  }

  const required = <span aria-hidden="true" className="text-rose-500"> *</span>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">Consultation</h1>
            {consultation && <ConsultationStatusBadge status={consultation.status} />}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {appointment.appointmentId} · {formatDate(appointment.appointmentDate)} ·{' '}
            {appointment.startTime}–{appointment.endTime}
            {consultation && <> · {consultation.consultationId}</>}
          </p>
        </div>
        <Link to="/doctor/appointments">
          <Button variant="ghost">Back to appointments</Button>
        </Link>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {actionError && <Alert tone="error">{actionError}</Alert>}

      {/* Patient summary */}
      {patient && (
        <Card title="Patient summary">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="font-semibold text-slate-800">
              {patient.firstName} {patient.lastName}
            </span>
            <span className="text-brand-800">{patient.patientId}</span>
            <span>{patient.age ?? calculateAge(patient.dateOfBirth)} years</span>
            <span className="capitalize">{patient.gender}</span>
            {patient.bloodGroup !== 'unknown' && <span>{patient.bloodGroup}</span>}
            <span>{patient.phone}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-600">Allergies:</span>
            {patient.allergies.length === 0 ? (
              <span className="text-sm text-slate-400">None recorded</span>
            ) : (
              patient.allergies.map((a) => (
                <Badge key={a} tone="red">
                  {a}
                </Badge>
              ))
            )}
          </div>
          {patient.medicalHistory.length > 0 && (
            <p className="mt-2 text-sm text-slate-600">
              <span className="font-medium">History:</span> {patient.medicalHistory.join(' · ')}
            </p>
          )}
        </Card>
      )}

      {/* Previous consultations (read-only review) */}
      {patient && <ConsultationHistoryCard patientMongoId={patient._id} />}

      {!consultation ? (
        <Card title="Start consultation">
          <p className="text-sm text-slate-600">
            Starting the consultation opens the clinical record for this visit. A scheduled
            appointment is confirmed automatically.
          </p>
          <div className="mt-4">
            <Button loading={starting} onClick={handleStart}>
              {starting ? 'Starting…' : 'Start consultation'}
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <Card title="Vital signs">
            <VitalSignsFields value={vitals} onChange={setVitals} />
          </Card>

          <Card title="Clinical notes">
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
                onChange={(e) => setForm((f) => ({ ...f, physicalExamination: e.target.value }))}
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

          <Card title="Diagnosis" subtitle="At least one diagnosis is required to complete">
            <DiagnosisEditor value={diagnoses} onChange={setDiagnoses} />
          </Card>

          <Card title="Treatment plan">
            <Textarea
              label={<>Treatment plan{required}</>}
              value={form.treatmentPlan}
              onChange={(e) => setForm((f) => ({ ...f, treatmentPlan: e.target.value }))}
              rows={3}
              placeholder="Treatment, lifestyle advice, follow-up instructions…"
            />
          </Card>

          <Card title="Prescription">
            <PrescriptionEditor value={prescriptions} onChange={setPrescriptions} />
          </Card>

          <LabOrdersCard consultationMongoId={consultation._id} />

          <Card title="Follow-up">
            <Input
              label="Follow-up date"
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              value={form.followUpDate}
              onChange={(e) => setForm((f) => ({ ...f, followUpDate: e.target.value }))}
              hint="Optional — no appointment is created automatically."
              className="max-w-xs"
            />
          </Card>

          <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" loading={saving} onClick={handleSave}>
                {saving ? 'Saving…' : 'Save progress'}
              </Button>
              <Button onClick={() => setCompleteOpen(true)} disabled={saving || completing}>
                Complete consultation
              </Button>
            </div>
          </div>
        </>
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
    </div>
  );
}
