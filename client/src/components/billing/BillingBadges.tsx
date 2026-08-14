import Badge, { type BadgeTone } from '../ui/Badge';
import type { InvoicePaymentStatus, InvoiceStatus, PaymentRecordStatus, PaymentType } from '../../types';

const INVOICE: Record<InvoiceStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'slate' },
  issued: { label: 'Issued', tone: 'blue' },
  cancelled: { label: 'Cancelled', tone: 'red' },
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const { label, tone } = INVOICE[status];
  return <Badge tone={tone}>{label}</Badge>;
}

const PAYMENT: Record<InvoicePaymentStatus, { label: string; tone: BadgeTone }> = {
  unpaid: { label: 'Unpaid', tone: 'amber' },
  partially_paid: { label: 'Partially paid', tone: 'blue' },
  paid: { label: 'Paid', tone: 'green' },
  refunded: { label: 'Refunded', tone: 'red' },
};

export function InvoicePaymentBadge({ status }: { status: InvoicePaymentStatus }) {
  const { label, tone } = PAYMENT[status];
  return <Badge tone={tone}>{label}</Badge>;
}

const RECORD: Record<PaymentRecordStatus, { label: string; tone: BadgeTone }> = {
  completed: { label: 'Completed', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
  refunded: { label: 'Refunded', tone: 'amber' },
};

export function PaymentRecordBadge({ status, type }: { status: PaymentRecordStatus; type: PaymentType }) {
  if (type === 'refund') return <Badge tone="red">Refund</Badge>;
  const { label, tone } = RECORD[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export const methodLabel = (method: string): string =>
  method.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
