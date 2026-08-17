import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import useSettings from '../../hooks/useSettings';
import { getConsultationById } from '../../services/consultationService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type { Consultation } from '../../types';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import BackLink from '../../components/ui/BackLink';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import ConsultationStatusBadge from '../../components/consultations/ConsultationStatusBadge';
import { DiagnosisList } from '../../components/consultations/DiagnosisEditor';
import { PrescriptionList } from '../../components/consultations/PrescriptionEditor';
import { VitalSignsCard } from '../../components/consultations/VitalSignsFields';

/** One heading and its prose. Sentences, so they are not right-aligned. */
function TextBlock({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      {value ? (
        <p className="mt-1.5 whitespace-pre-wrap text-pretty text-sm leading-relaxed text-slate-800">
          {value}
        </p>
      ) : (
        <p className="mt-1.5 text-sm text-slate-500">Not recorded</p>
      )}
    </div>
  );
}

/** One fact in the strip under the heading. */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 truncate text-[0.9375rem] font-semibold text-slate-900">{value}</p>
    </div>
  );
}

/** Read-only clinical record (admin, nurse, and doctors per visibility rules). */
export default function ConsultationDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { role } = useAuth();
  const { hospitalName } = useSettings();

  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flash] = useState<string>(
    () => (location.state as { flash?: string } | null)?.flash ?? ''
  );

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      setConsultation(await getConsultationById(id));
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load this consultation.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <FullPageSpinner label="Loading consultation" />;

  if (!consultation) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-10 text-center">
        <Alert tone="error">{error || 'This consultation could not be found.'}</Alert>
        <Link to={role === 'doctor' ? '/doctor/consultations' : '/'}>
          <Button variant="secondary">
            {role === 'doctor' ? 'Back to my consultations' : 'Back to dashboard'}
          </Button>
        </Link>
      </div>
    );
  }

  const patient = consultation.patientId;
  const patientName = patient ? `${patient.firstName} ${patient.lastName}` : null;
  const doctorName = consultation.doctorId
    ? `Dr. ${consultation.doctorId.firstName} ${consultation.doctorId.lastName}`
    : null;

  /**
   * Three roles reach this page from three different places. A doctor owns a
   * list of their own records; an administrator or a nurse arrives from the
   * patient, so that is where they are sent back to.
   */
  const back =
    role === 'doctor'
      ? { to: '/doctor/consultations', label: 'My consultations' }
      : patient
        ? { to: `/patients/${patient._id}`, label: patientName ?? 'Patient' }
        : null;

  const canContinue =
    role === 'doctor' && consultation.status === 'in_progress' && consultation.appointmentId;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      {back && (
        <div className="print:hidden">
          <BackLink to={back.to} label={back.label} />
        </div>
      )}

      {/* Letterhead — on paper only. A clinical record handed to a patient has
          to say which hospital wrote it. */}
      <div className="hidden print:block">
        <p className="text-lg font-semibold text-slate-900">{hospitalName}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Consultation record {consultation.consultationId}
        </p>
      </div>

      <section className="surface-card relative overflow-hidden print:border-0 print:shadow-none">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-50 via-white to-white print:hidden"
        />

        <div className="relative p-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-xl font-semibold tracking-[-0.014em] text-slate-900 sm:text-2xl">
              {patientName ?? consultation.consultationId}
            </h1>
            <ConsultationStatusBadge status={consultation.status} />
          </div>

          <p className="mt-1.5 text-sm text-slate-500">
            {patient && (
              <>
                <Link
                  className="font-medium text-brand-800 transition-colors hover:text-brand-900 hover:underline"
                  to={`/patients/${patient._id}`}
                >
                  {patient.patientId}
                </Link>
                {' · '}
              </>
            )}
            Record{' '}
            <span className="font-semibold tabular-nums text-slate-700">
              {consultation.consultationId}
            </span>
            {patient?.phone && <> · <span className="tabular-nums">{patient.phone}</span></>}
          </p>

          {(patient?.allergies?.length ?? 0) > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-2 ring-1 ring-inset ring-rose-100">
              <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-rose-700">
                Allergies
              </span>
              {patient!.allergies!.map((allergy) => (
                <Badge key={allergy} tone="red">
                  {allergy}
                </Badge>
              ))}
            </div>
          )}

          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-line pt-4 sm:grid-cols-4">
            <Figure label="Seen" value={formatDate(consultation.consultationDate)} />
            <Figure label="Doctor" value={doctorName ?? 'Not recorded'} />
            <Figure label="Department" value={consultation.departmentId?.name ?? 'Not recorded'} />
            <Figure
              label="Follow-up"
              value={
                consultation.followUpDate ? formatDate(consultation.followUpDate) : 'None scheduled'
              }
            />
          </dl>
        </div>

        <div className="relative flex flex-col gap-2 border-t border-line bg-slate-50/70 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end print:hidden">
          <Button variant="secondary" className="w-full sm:w-auto" onClick={() => window.print()}>
            Print
          </Button>
          {canContinue && (
            <Link
              to={`/doctor/appointments/${consultation.appointmentId!._id}/consultation`}
              state={{
                origin: { to: `/consultations/${consultation._id}`, label: consultation.consultationId },
              }}
              className="w-full sm:w-auto"
            >
              <Button className="w-full sm:w-auto">Continue consultation</Button>
            </Link>
          )}
        </div>
      </section>

      {flash && (
        <Alert tone="success" className="print:hidden">
          {flash}
        </Alert>
      )}
      {consultation.status === 'completed' && (
        <Alert tone="info" className="print:hidden">
          This clinical record is completed and read-only.
        </Alert>
      )}

      <Card title="Vital signs" icon="activity" className="print:shadow-none">
        <VitalSignsCard vitals={consultation.vitalSigns} />
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
        <Card title="Clinical information" icon="clipboard" className="print:shadow-none">
          <div className="space-y-5">
            <TextBlock label="Chief complaint" value={consultation.chiefComplaint} />
            <TextBlock
              label="History of present illness"
              value={consultation.historyOfPresentIllness}
            />
            <TextBlock label="Physical examination" value={consultation.physicalExamination} />
            <TextBlock label="Clinical notes" value={consultation.clinicalNotes} />
            <TextBlock label="Assessment" value={consultation.assessment} />
          </div>
        </Card>

        <div className="space-y-6">
          <Card title="Diagnosis" icon="flask" className="print:shadow-none">
            <DiagnosisList diagnoses={consultation.diagnoses} />
          </Card>

          <Card title="Treatment plan" icon="check" className="print:shadow-none">
            {consultation.treatmentPlan ? (
              <p className="whitespace-pre-wrap text-pretty text-sm leading-relaxed text-slate-800">
                {consultation.treatmentPlan}
              </p>
            ) : (
              <p className="text-sm text-slate-500">Not recorded</p>
            )}
          </Card>
        </div>
      </div>

      <Card title="Prescription" icon="pill" padded={false} className="print:shadow-none">
        <PrescriptionList prescriptions={consultation.prescriptions} />
      </Card>
    </div>
  );
}
