import Badge, { type BadgeTone } from '../ui/Badge';
import type { AdmissionStatus, BedStatus } from '../../types';

const BED: Record<BedStatus, { label: string; tone: BadgeTone }> = {
  available: { label: 'Available', tone: 'green' },
  occupied: { label: 'Occupied', tone: 'blue' },
  reserved: { label: 'Reserved', tone: 'amber' },
  maintenance: { label: 'Maintenance', tone: 'red' },
  inactive: { label: 'Inactive', tone: 'slate' },
};

export function BedStatusBadge({ status }: { status: BedStatus }) {
  const { label, tone } = BED[status];
  return <Badge tone={tone}>{label}</Badge>;
}

const ADMISSION: Record<AdmissionStatus, { label: string; tone: BadgeTone }> = {
  admitted: { label: 'Admitted', tone: 'blue' },
  transferred: { label: 'Transferred', tone: 'amber' },
  discharged: { label: 'Discharged', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'red' },
};

export function AdmissionStatusBadge({ status }: { status: AdmissionStatus }) {
  const { label, tone } = ADMISSION[status];
  return <Badge tone={tone}>{label}</Badge>;
}
