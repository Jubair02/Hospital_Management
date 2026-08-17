import { useNavigate } from 'react-router-dom';
import { createAppointment } from '../../services/appointmentService';
import { getErrorMessage } from '../../services/api';
import type { CreateAppointmentPayload } from '../../types';
import AppointmentForm from '../../components/appointments/AppointmentForm';
import useAuth from '../../hooks/useAuth';
import { appointmentsListPath } from '../../utils/permissions';
import PageHeader from '../../components/ui/PageHeader';

export default function AppointmentCreatePage() {
  const navigate = useNavigate();
  const { role } = useAuth();

  const handleSubmit = async (payload: CreateAppointmentPayload) => {
    try {
      const appointment = await createAppointment(payload);
      navigate(`/appointments/${appointment._id}`, {
        state: { flash: `Appointment ${appointment.appointmentId} booked.` },
      });
    } catch (err) {
      throw new Error(getErrorMessage(err, 'Unable to book the appointment.'));
    }
  };

  return (
    // Wider than a single form column: the form now runs beside a summary
    // panel that carries the confirm button, and 56rem left the two too narrow
    // to hold four time chips a row.
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Appointments"
        title="Book appointment"
        subtitle="Pick the patient, doctor, and an available time slot. Only free times inside the doctor's availability can be chosen."
      />

      <AppointmentForm
        onSubmit={handleSubmit}
        onCancel={() => navigate(appointmentsListPath(role))}
      />
    </div>
  );
}
