import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { getConsultationById } from '../../services/consultationService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type { Consultation } from '../../types';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import ConsultationStatusBadge from '../../components/consultations/ConsultationStatusBadge';
import { DiagnosisList } from '../../components/consultations/DiagnosisEditor';
import { PrescriptionList } from '../../components/consultations/PrescriptionEditor';
import { VitalSignsCard } from '../../components/consultations/VitalSignsFields';

function TextBlock({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-700">{label}</p>
      {value ? (
        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{value}</p>
      ) : (
        <p className="mt-1 text-sm text-slate-400">Not recorded.</p>
      )}
    </div>
  );
}

/** Read-only clinical record (admin, nurse, and doctors per visibility rules). */
export default function ConsultationDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { role } = useAuth();

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
      <div className="space-y-4">
        <Alert tone="error">{error || 'Consultation not found.'}</Alert>
      </div>
    );
  }

  const patient = consultation.patientId;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">
              {consultation.consultationId}
            </h1>
            <ConsultationStatusBadge status={consultation.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {formatDate(consultation.consultationDate)}
            {consultation.doctorId && (
              <>
                {' · '}Dr. {consultation.doctorId.firstName} {consultation.doctorId.lastName}
              </>
            )}
            {consultation.departmentId && <> · {consultation.departmentId.name}</>}
          </p>
        </div>
        {role === 'doctor' &&
          consultation.status === 'in_progress' &&
          consultation.appointmentId && (
            <Link to={`/doctor/appointments/${consultation.appointmentId._id}/consultation`}>
              <Button>Continue consultation</Button>
            </Link>
          )}
      </div>

      {flash && <Alert tone="success">{flash}</Alert>}
      {consultation.status === 'completed' && (
        <Alert tone="info">This clinical record is completed and read-only.</Alert>
      )}

      {/* Patient */}
      {patient && (
        <Card title="Patient">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <Link
              to={`/patients/${patient._id}`}
              className="font-semibold text-brand-800 hover:underline"
            >
              {patient.firstName} {patient.lastName}
            </Link>
            <span>{patient.patientId}</span>
            {patient.phone && <span>{patient.phone}</span>}
            {(patient.allergies?.length ?? 0) > 0 && (
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-slate-500">Allergies:</span>
                {patient.allergies!.map((a) => (
                  <Badge key={a} tone="red">
                    {a}
                  </Badge>
                ))}
              </span>
            )}
          </div>
        </Card>
      )}

      <Card title="Vital signs">
        <VitalSignsCard vitals={consultation.vitalSigns} />
      </Card>

      <Card title="Clinical information">
        <div className="space-y-4">
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

      <Card title="Diagnosis">
        <DiagnosisList diagnoses={consultation.diagnoses} />
      </Card>

      <Card title="Treatment plan">
        <TextBlock label="Plan" value={consultation.treatmentPlan} />
      </Card>

      <Card title="Prescription">
        <PrescriptionList prescriptions={consultation.prescriptions} />
      </Card>

      <Card title="Follow-up">
        {consultation.followUpDate ? (
          <p className="text-sm text-slate-700">
            Follow-up recommended on{' '}
            <span className="font-semibold">{formatDate(consultation.followUpDate)}</span>.
          </p>
        ) : (
          <p className="text-sm text-slate-400">No follow-up scheduled.</p>
        )}
      </Card>
    </div>
  );
}
