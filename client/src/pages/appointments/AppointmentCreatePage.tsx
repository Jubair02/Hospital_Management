import { useNavigate } from 'react-router-dom';
import { createAppointment } from '../../services/appointmentService';
import { getErrorMessage } from '../../services/api';
import type { CreateAppointmentPayload } from '../../types';
import AppointmentForm from '../../components/appointments/AppointmentForm';
import useAuth from '../../hooks/useAuth';
import { appointmentsListPath } from '../../utils/permissions';

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
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Book appointment</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pick the patient, doctor, and an available time slot.
        </p>
      </div>

      <AppointmentForm
        onSubmit={handleSubmit}
        onCancel={() => navigate(appointmentsListPath(role))}
      />
    </div>
  );
}
