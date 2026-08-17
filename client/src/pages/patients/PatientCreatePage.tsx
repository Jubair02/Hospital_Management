import { Link, useNavigate } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { createPatient } from '../../services/patientService';
import { getErrorMessage } from '../../services/api';
import { patientsListPath } from '../../utils/permissions';
import type { CreatePatientPayload } from '../../types';
import PatientForm from '../../components/patients/PatientForm';
import Icon from '../../components/ui/icons';
import PageHeader from '../../components/ui/PageHeader';

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
    // Wider than a reading column: the field groups run three across from `lg`,
    // and 56rem squeezed them into a shape that wrapped labels.
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="space-y-3">
        <Link
          to={patientsListPath(role)}
          className="-ml-1 inline-flex min-h-8 items-center gap-1 rounded-lg px-1 text-sm font-medium text-slate-500 transition-colors duration-200 hover:text-slate-900"
        >
          <Icon name="chevronLeft" className="h-4 w-4" strokeWidth="2.2" />
          Patients
        </Link>

        <PageHeader
          eyebrow="Patients"
          title="Register patient"
          subtitle="A patient ID is generated on save. Only name, date of birth, gender, and phone are needed to start — everything else can be added later."
        />
      </div>

      <PatientForm
        submitLabel="Register patient"
        onSubmit={handleSubmit}
        onCancel={() => navigate(patientsListPath(role))}
      />
    </div>
  );
}
