import { useNavigate } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { createPatient } from '../../services/patientService';
import { getErrorMessage } from '../../services/api';
import { patientsListPath } from '../../utils/permissions';
import type { CreatePatientPayload } from '../../types';
import PatientForm from '../../components/patients/PatientForm';

export default function PatientCreatePage() {
  const navigate = useNavigate();
  const { role } = useAuth();

  const handleSubmit = async (payload: CreatePatientPayload) => {
    try {
      const patient = await createPatient(payload);
      navigate(`/patients/${patient._id}`, {
        state: { flash: `${patient.firstName} ${patient.lastName} registered as ${patient.patientId}.` },
      });
    } catch (err) {
      // PatientForm displays the message next to the form.
      throw new Error(getErrorMessage(err, 'Unable to register the patient.'));
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Register patient</h1>
        <p className="mt-1 text-sm text-slate-500">
          Fields marked <span className="text-rose-500">*</span> are required.
        </p>
      </div>

      <PatientForm
        submitLabel="Save patient"
        onSubmit={handleSubmit}
        onCancel={() => navigate(patientsListPath(role))}
      />
    </div>
  );
}
