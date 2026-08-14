import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import {
  getDoctorById,
  updateDoctorAvailability,
} from '../../services/doctorService';
import { getErrorMessage } from '../../services/api';
import { canManageDoctors } from '../../utils/permissions';
import { formatDate } from '../../utils/date';
import type { AvailabilitySlot, Doctor } from '../../types';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import AvailabilityCard from '../../components/doctors/AvailabilityCard';
import AvailabilityEditor from '../../components/doctors/AvailabilityEditor';

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right">
        {value ? (
          <span className="text-slate-800">{value}</span>
        ) : (
          <span className="text-slate-400">Not recorded</span>
        )}
      </dd>
    </div>
  );
}

export default function DoctorProfilePage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { role } = useAuth();
  const manage = canManageDoctors(role);

  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice] = useState<string>(
    () => (location.state as { flash?: string } | null)?.flash ?? ''
  );
  const [editingAvailability, setEditingAvailability] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      setDoctor(await getDoctorById(id));
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load this doctor.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const saveAvailability = async (slots: AvailabilitySlot[]) => {
    if (!doctor) return;
    try {
      const availability = await updateDoctorAvailability(doctor._id, slots);
      setDoctor({ ...doctor, availability });
      setEditingAvailability(false);
    } catch (err) {
      throw new Error(getErrorMessage(err, 'Unable to save availability.'));
    }
  };

  if (loading) return <FullPageSpinner label="Loading doctor" />;

  if (!doctor) {
    return (
      <div className="space-y-4">
        <Alert tone="error">{error || 'Doctor not found.'}</Alert>
        <Link to="/admin/doctors">
          <Button variant="secondary">Back to doctors</Button>
        </Link>
      </div>
    );
  }

  const departmentName =
    typeof doctor.departmentId === 'object' && doctor.departmentId
      ? doctor.departmentId.name
      : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">
              Dr. {doctor.firstName} {doctor.lastName}
            </h1>
            {doctor.status === 'active' ? (
              <Badge tone="green">Active</Badge>
            ) : (
              <Badge tone="red">Inactive</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            <span className="font-medium text-brand-800">{doctor.doctorId}</span>
            {' · '}
            {doctor.specialization}
            {departmentName && <> · {departmentName}</>}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link to={manage ? '/admin/doctors' : `/${role}/doctors`}>
            <Button variant="ghost">Back to list</Button>
          </Link>
          {manage && (
            <Link to={`/admin/doctors/${doctor._id}/edit`}>
              <Button variant="secondary">Edit</Button>
            </Link>
          )}
        </div>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Professional details">
          <dl className="space-y-3">
            <Row label="Specialization" value={doctor.specialization} />
            <Row label="Department" value={departmentName} />
            <Row label="Qualification" value={doctor.qualification} />
            <Row label="License number" value={doctor.licenseNumber} />
            <Row
              label="Experience"
              value={
                doctor.experienceYears !== undefined ? `${doctor.experienceYears} years` : undefined
              }
            />
            <Row
              label="Consultation fee"
              value={doctor.consultationFee !== undefined ? String(doctor.consultationFee) : undefined}
            />
            <Row label="Joined" value={formatDate(doctor.createdAt)} />
          </dl>
        </Card>

        <Card title="Contact">
          <dl className="space-y-3">
            <Row label="Email" value={doctor.email} />
            <Row label="Phone" value={doctor.phone} />
          </dl>
          {doctor.bio && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="text-sm font-medium text-slate-700">Bio</p>
              <p className="mt-1 text-sm text-slate-600">{doctor.bio}</p>
            </div>
          )}
        </Card>
      </div>

      {editingAvailability && manage ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Edit availability</h2>
            <Button variant="ghost" size="sm" onClick={() => setEditingAvailability(false)}>
              Close editor
            </Button>
          </div>
          <AvailabilityEditor initial={doctor.availability} onSave={saveAvailability} />
        </div>
      ) : (
        <AvailabilityCard
          availability={doctor.availability}
          actions={
            manage && (
              <Button variant="secondary" size="sm" onClick={() => setEditingAvailability(true)}>
                Manage availability
              </Button>
            )
          }
        />
      )}
    </div>
  );
}
