import { useEffect, useState } from 'react';
import { getMyDoctorProfile, updateDoctorAvailability } from '../../services/doctorService';
import { getAppointments } from '../../services/appointmentService';
import { getErrorMessage } from '../../services/api';
import type { Appointment, AvailabilitySlot, Doctor } from '../../types';
import { localDay } from '../../utils/date';
import Alert from '../../components/ui/Alert';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import AvailabilityEditor from '../../components/doctors/AvailabilityEditor';
import PageHeader from '../../components/ui/PageHeader';

/** The logged-in doctor manages their own weekly availability. */
export default function DoctorAvailabilityPage() {
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [upcoming, setUpcoming] = useState<Appointment[]>([]);

  useEffect(() => {
    getMyDoctorProfile()
      .then(setDoctor)
      .catch((err: unknown) => setError(getErrorMessage(err, 'Unable to load your profile.')))
      .finally(() => setLoading(false));

    // What the new windows have to keep covering. Fetched once alongside the
    // profile: a failure here must not stop someone editing their hours, so
    // the check simply has nothing to warn about.
    getAppointments({ dateFrom: localDay(), limit: 200 })
      .then((data) =>
        setUpcoming(
          data.appointments.filter(
            (a) => a.status === 'scheduled' || a.status === 'confirmed'
          )
        )
      )
      .catch(() => setUpcoming([]));
  }, []);

  const handleSave = async (slots: AvailabilitySlot[]) => {
    if (!doctor) return;
    try {
      await updateDoctorAvailability(doctor._id, slots);
    } catch (err) {
      throw new Error(getErrorMessage(err, 'Unable to save availability.'));
    }
  };

  /**
   * Bookings that the proposed windows would no longer cover.
   *
   * Saving does not cancel them — the server keeps every appointment exactly
   * where it is — which is the problem: they quietly become a clinic nobody
   * has hours for. Naming them before the save is the only warning there is.
   */
  const strandedBy = (slots: AvailabilitySlot[]): Appointment[] => {
    const DAY_NAMES = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ] as const;

    return upcoming.filter((appointment) => {
      const day = DAY_NAMES[new Date(appointment.appointmentDate).getUTCDay()];
      const covered = slots.some(
        (slot) =>
          slot.isAvailable &&
          slot.dayOfWeek === day &&
          slot.startTime <= appointment.startTime &&
          slot.endTime >= appointment.endTime
      );
      return !covered;
    });
  };

  if (loading) return <FullPageSpinner label="Loading your availability" />;

  if (!doctor) {
    // Keep the heading: a bare red box on an otherwise empty page reads as a
    // broken screen rather than as one screen reporting a problem.
    return (
      // Capped here, unlike the editor below: a single sentence of error has no
      // business spanning a 1600px screen.
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <PageHeader
          eyebrow="Schedule"
          title="My availability"
          subtitle="Appointments can only be booked inside these windows."
        />
        <Alert tone="error">{error || 'No doctor profile is linked to your account.'}</Alert>
      </div>
    );
  }

  return (
    // Full width, capped only by the shell's own 1600px column. This screen is
    // a week — a grid of seven days and their clock — not prose, so a reading
    // column left two thirds of a desktop empty while the day rows fought for
    // room. The editor spends the width itself: an overview across the top, and
    // the days two abreast above `2xl`.
    <div className="w-full space-y-6">
      <PageHeader
        eyebrow="Schedule"
        title="My availability"
        subtitle="Appointments can only be booked inside these windows. Changes apply to new bookings — anything already in the diary stays put."
      />

      <AvailabilityEditor
        initial={doctor.availability ?? []}
        onSave={handleSave}
        findStranded={strandedBy}
      />
    </div>
  );
}
