import Badge, { type BadgeTone } from '../ui/Badge';
import type { ConsultationStatus } from '../../types';

const CONFIG: Record<ConsultationStatus, { label: string; tone: BadgeTone }> = {
  in_progress: { label: 'In progress', tone: 'amber' },
  completed: { label: 'Completed', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'red' },
};

export default function ConsultationStatusBadge({ status }: { status: ConsultationStatus }) {
  const { label, tone } = CONFIG[status];
  return <Badge tone={tone}>{label}</Badge>;
}
