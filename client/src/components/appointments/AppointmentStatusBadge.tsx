import Badge, { type BadgeTone } from '../ui/Badge';
import type { AppointmentStatus } from '../../types';

const CONFIG: Record<AppointmentStatus, { label: string; tone: BadgeTone }> = {
  scheduled: { label: 'Scheduled', tone: 'amber' },
  confirmed: { label: 'Confirmed', tone: 'blue' },
  completed: { label: 'Completed', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'red' },
  no_show: { label: 'No show', tone: 'slate' },
};

export default function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  const { label, tone } = CONFIG[status];
  return <Badge tone={tone}>{label}</Badge>;
}
