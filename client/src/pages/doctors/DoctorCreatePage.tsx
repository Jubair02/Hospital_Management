import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createDoctor } from '../../services/doctorService';
import { getDepartments } from '../../services/departmentService';
import { getErrorMessage } from '../../services/api';
import type { CreateDoctorPayload, Department, UpdateDoctorPayload } from '../../types';
import DoctorForm from '../../components/doctors/DoctorForm';
import Alert from '../../components/ui/Alert';

export default function DoctorCreatePage() {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    getDepartments()
      .then(setDepartments)
      .catch((err: unknown) => setError(getErrorMessage(err, 'Unable to load departments.')));
  }, []);

  const handleSubmit = async (payload: CreateDoctorPayload | UpdateDoctorPayload) => {
    try {
      const doctor = await createDoctor(payload as CreateDoctorPayload);
      navigate(`/admin/doctors/${doctor._id}`, {
        state: { flash: `Dr. ${doctor.firstName} ${doctor.lastName} created as ${doctor.doctorId}.` },
      });
    } catch (err) {
      throw new Error(getErrorMessage(err, 'Unable to create the doctor.'));
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Add doctor</h1>
        <p className="mt-1 text-sm text-slate-500">
          Creates the doctor's login account and professional profile together.
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <DoctorForm
        departments={departments}
        submitLabel="Create doctor"
        onSubmit={handleSubmit}
        onCancel={() => navigate('/admin/doctors')}
      />
    </div>
  );
}
