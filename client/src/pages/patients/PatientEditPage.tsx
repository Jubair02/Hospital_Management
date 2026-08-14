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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Edit patient
          <span className="ml-3 text-base font-normal text-slate-500">{patient.patientId}</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Fields marked <span className="text-rose-500">*</span> are required.
        </p>
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
