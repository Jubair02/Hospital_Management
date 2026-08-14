import Badge, { type BadgeTone } from '../../components/ui/Badge';
import type { AppointmentStatus, PortalDoctor } from '../../types';

/** "no_show" → "No show" */
export const humanize = (value: string): string =>
  value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

const APPOINTMENT_TONES: Record<AppointmentStatus, BadgeTone> = {
  scheduled: 'blue',
  confirmed: 'teal',
  completed: 'green',
  cancelled: 'red',
  no_show: 'amber',
};

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  return <Badge tone={APPOINTMENT_TONES[status] ?? 'slate'}>{humanize(status)}</Badge>;
}

const GENERIC_TONES: Record<string, BadgeTone> = {
  // shared across lab orders/results, invoices, dispensing, admissions
  ordered: 'blue',
  sample_collected: 'amber',
  in_progress: 'amber',
  processing: 'amber',
  pending: 'slate',
  partial: 'amber',
  completed: 'green',
  verified: 'green',
  dispensed: 'green',
  paid: 'green',
  partially_paid: 'amber',
  unpaid: 'red',
  refunded: 'slate',
  issued: 'blue',
  admitted: 'blue',
  discharged: 'green',
  cancelled: 'red',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={GENERIC_TONES[status] ?? 'slate'}>{humanize(status)}</Badge>;
}

/** "Dr. Amara Osei · Cardiology" from a populated portal doctor ref. */
export const doctorLabel = (doctor: PortalDoctor | null): string =>
  doctor
    ? `Dr. ${doctor.firstName} ${doctor.lastName}${doctor.specialization ? ` · ${doctor.specialization}` : ''}`
    : '—';
