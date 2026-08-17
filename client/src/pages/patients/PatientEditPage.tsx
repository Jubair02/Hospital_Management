import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { getPatientById, updatePatient } from '../../services/patientService';
import { getErrorMessage } from '../../services/api';
import { patientsListPath } from '../../utils/permissions';
import type { CreatePatientPayload, Patient } from '../../types';
import PatientForm from '../../components/patients/PatientForm';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Icon from '../../components/ui/icons';
import PageHeader from '../../components/ui/PageHeader';

export default function PatientEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError('');
    try {
      setPatient(await getPatientById(id));
    } catch (err) {
      setLoadError(getErrorMessage(err, 'Unable to load this patient.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (payload: CreatePatientPayload) => {
    if (!patient) return;
    try {
      const updated = await updatePatient(patient._id, payload);
      navigate(`/patients/${updated._id}`, {
        state: { flash: `${updated.firstName} ${updated.lastName} updated.` },
      });
    } catch (err) {
      throw new Error(getErrorMessage(err, 'Unable to save the changes.'));
    }
  };

  if (loading) return <FullPageSpinner label="Loading patient" />;

  if (!patient) {
    return (
      <div className="space-y-4">
        <Alert tone="error">{loadError || 'Patient not found.'}</Alert>
        <Link to={patientsListPath(role)}>
          <Button variant="secondary">Back to patients</Button>
        </Link>
      </div>
    );
  }

  const fullName = `${patient.firstName} ${patient.lastName}`;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="space-y-3">
        {/* Back to the record being edited rather than the whole list — that
            is where this page is reached from, and where Cancel returns to. */}
        <Link
          to={`/patients/${patient._id}`}
          className="-ml-1 inline-flex min-h-8 items-center gap-1 rounded-lg px-1 text-sm font-medium text-slate-500 transition-colors duration-200 hover:text-slate-900"
        >
          <Icon name="chevronLeft" className="h-4 w-4" strokeWidth="2.2" />
          {fullName}
        </Link>

        <PageHeader
          eyebrow={`Patient · ${patient.patientId}`}
          title="Edit patient"
          subtitle="Changes apply to the record everyone sees. The patient ID and registration date cannot be changed."
        />
      </div>

      <PatientForm
        patient={patient}
        submitLabel="Save changes"
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/patients/${patient._id}`)}
      />
    </div>
  );
}
