import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getDoctorById, updateDoctor } from '../../services/doctorService';
import { getDepartments } from '../../services/departmentService';
import { getErrorMessage } from '../../services/api';
import type { CreateDoctorPayload, Department, Doctor, UpdateDoctorPayload } from '../../types';
import DoctorForm from '../../components/doctors/DoctorForm';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';

export default function DoctorEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError('');
    try {
      const [doc, deps] = await Promise.all([getDoctorById(id), getDepartments()]);
      setDoctor(doc);
      setDepartments(deps);
    } catch (err) {
      setLoadError(getErrorMessage(err, 'Unable to load this doctor.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (payload: CreateDoctorPayload | UpdateDoctorPayload) => {
    if (!doctor) return;
    try {
      const updated = await updateDoctor(doctor._id, payload as UpdateDoctorPayload);
      navigate(`/admin/doctors/${updated._id}`, {
        state: { flash: `Dr. ${updated.firstName} ${updated.lastName} updated.` },
      });
    } catch (err) {
      throw new Error(getErrorMessage(err, 'Unable to save the changes.'));
    }
  };

  if (loading) return <FullPageSpinner label="Loading doctor" />;

  if (!doctor) {
    return (
      <div className="space-y-4">
        <Alert tone="error">{loadError || 'Doctor not found.'}</Alert>
        <Link to="/admin/doctors">
          <Button variant="secondary">Back to doctors</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Edit doctor
          <span className="ml-3 text-base font-normal text-slate-500">{doctor.doctorId}</span>
        </h1>
      </div>

      <DoctorForm
        doctor={doctor}
        departments={departments}
        submitLabel="Save changes"
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/admin/doctors/${doctor._id}`)}
      />
    </div>
  );
}
