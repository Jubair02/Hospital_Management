import { Link } from 'react-router-dom';
import type { Appointment, Consultation } from '../../types';
import type { WorkbenchOrigin } from '../../pages/consultations/ConsultationWorkbenchPage';
import Button from '../ui/Button';
import Icon from '../ui/icons';

/** Statuses from which the server will open a new record. */
const STARTABLE = new Set(['scheduled', 'confirmed']);

interface ConsultationActionProps {
  appointment: Appointment;
  /** The doctor's open records by appointment — see useLiveConsultations. */
  live: Map<string, Consultation>;
  /** Where the workbench should send the doctor back to. */
  origin: WorkbenchOrigin;
  className?: string;
}

/**
 * The one thing a doctor does with a booking, on the booking itself.
 *
 * Seeing a patient used to mean finding the appointment, opening it, and only
 * then reaching the record. The schedule is where the doctor already is, so
 * the action belongs on the row — and which action it is comes from whether a
 * record is open, never from the appointment's status, which cannot tell a
 * live consultation from a cancelled one.
 */
export default function ConsultationAction({
  appointment,
  live,
  origin,
  className = '',
}: ConsultationActionProps) {
  const open = live.get(appointment._id);
  const workbench = `/doctor/appointments/${appointment._id}/consultation`;

  if (open) {
    return (
      <Link to={workbench} state={{ origin }} className={className} title={open.consultationId}>
        <Button size="sm">Continue consultation</Button>
      </Link>
    );
  }

  if (STARTABLE.has(appointment.status)) {
    return (
      <Link to={workbench} state={{ origin }} className={className}>
        <Button size="sm">Start consultation</Button>
      </Link>
    );
  }

  // Closed one way or another: cancelled, no-show, or already documented.
  return (
    <Link to={`/appointments/${appointment._id}`} className={className}>
      <Button variant="ghost" size="sm">
        View
        <Icon name="chevronRight" className="h-3.5 w-3.5" strokeWidth="2.2" />
      </Button>
    </Link>
  );
}
