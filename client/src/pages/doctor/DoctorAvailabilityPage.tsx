import { useEffect, useState } from 'react';
import { getMyDoctorProfile, updateDoctorAvailability } from '../../services/doctorService';
import { getErrorMessage } from '../../services/api';
import type { AvailabilitySlot, Doctor } from '../../types';
import Alert from '../../components/ui/Alert';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import AvailabilityEditor from '../../components/doctors/AvailabilityEditor';

/** The logged-in doctor manages their own weekly availability. */
export default function DoctorAvailabilityPage() {
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getMyDoctorProfile()
      .then(setDoctor)
      .catch((err: unknown) => setError(getErrorMessage(err, 'Unable to load your profile.')))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (slots: AvailabilitySlot[]) => {
    if (!doctor) return;
    try {
      await updateDoctorAvailability(doctor._id, slots);
    } catch (err) {
      throw new Error(getErrorMessage(err, 'Unable to save availability.'));
    }
  };

  if (loading) return <FullPageSpinner label="Loading your availability" />;

  if (!doctor) {
    return <Alert tone="error">{error || 'No doctor profile is linked to your account.'}</Alert>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">My availability</h1>
        <p className="mt-1 text-sm text-slate-500">
          Appointments can only be booked inside these time windows.
        </p>
      </div>

      <AvailabilityEditor initial={doctor.availability} onSave={handleSave} />
    </div>
  );
}
