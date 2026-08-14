import Badge, { type BadgeTone } from '../ui/Badge';
import type { LabOrderStatus, LabPriority, LabResultStatus, SampleStatus } from '../../types';

const ORDER: Record<LabOrderStatus, { label: string; tone: BadgeTone }> = {
  ordered: { label: 'Ordered', tone: 'amber' },
  sample_collected: { label: 'Sample collected', tone: 'blue' },
  processing: { label: 'Processing', tone: 'brand' },
  completed: { label: 'Completed', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'red' },
};

export function LabOrderStatusBadge({ status }: { status: LabOrderStatus }) {
  const { label, tone } = ORDER[status];
  return <Badge tone={tone}>{label}</Badge>;
}

const SAMPLE: Record<SampleStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Pending', tone: 'amber' },
  collected: { label: 'Collected', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
};

export function SampleStatusBadge({ status }: { status: SampleStatus }) {
  const { label, tone } = SAMPLE[status];
  return <Badge tone={tone}>{label}</Badge>;
}

const RESULT: Record<LabResultStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Pending', tone: 'slate' },
  processing: { label: 'Processing', tone: 'amber' },
  completed: { label: 'Completed', tone: 'blue' },
  verified: { label: 'Verified', tone: 'green' },
};

export function LabResultStatusBadge({ status }: { status: LabResultStatus }) {
  const { label, tone } = RESULT[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: LabPriority }) {
  return priority === 'urgent' ? (
    <Badge tone="red">Urgent</Badge>
  ) : (
    <Badge tone="slate">Routine</Badge>
  );
}
