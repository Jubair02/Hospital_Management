import type { Types } from 'mongoose';
import Invoice, {
  type IInvoiceItem,
  type InvoiceDocument,
  type InvoiceItemType,
  type InvoicePaymentStatus,
} from '../models/Invoice.js';
import Payment, { type PaymentDocument, type PaymentMethod } from '../models/Payment.js';
import Patient from '../models/Patient.js';
import Consultation from '../models/Consultation.js';
import Doctor from '../models/Doctor.js';
import LabOrder from '../models/LabOrder.js';
import DispensingRecord from '../models/DispensingRecord.js';
import ApiError from '../utils/ApiError.js';
import { nextSequenceId } from './sequenceService.js';
import { notifyPatient, notifyRoles } from './notificationService.js';

export const nextInvoiceId = (): Promise<string> => nextSequenceId('invoiceId', 'INV', 6);
export const nextPaymentId = (): Promise<string> => nextSequenceId('paymentId', 'PAY', 6);

// ---------------------------------------------------------------------------
// Money — all arithmetic happens in integer cents to avoid FP drift.
// ---------------------------------------------------------------------------

export const toCents = (value: number): number => Math.round(value * 100);
export const fromCents = (cents: number): number => Math.round(cents) / 100;

// ---------------------------------------------------------------------------
// Invoice creation / totals
// ---------------------------------------------------------------------------

export interface InvoiceItemInput {
  itemType: InvoiceItemType;
  referenceId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateInvoiceInput {
  patientId: string;
  appointmentId?: string;
  items: InvoiceItemInput[];
  discount?: number;
  tax?: number;
}

/** Validates that referenced source records exist for their item type. */
const assertItemReferences = async (items: InvoiceItemInput[]): Promise<void> => {
  for (const item of items) {
    if (item.itemType === 'service') continue;
    if (!item.referenceId) {
      throw new ApiError(400, `${item.itemType} items must reference the source record.`);
    }

    const exists =
      item.itemType === 'consultation'
        ? await Consultation.exists({ _id: item.referenceId })
        : item.itemType === 'lab_order'
          ? await LabOrder.exists({ _id: item.referenceId })
          : await DispensingRecord.exists({ _id: item.referenceId });

    if (!exists) {
      throw new ApiError(404, `Referenced ${item.itemType.replace('_', ' ')} record not found.`);
    }
  }
};

/** Computes item totals + invoice totals in cents; client totals are ignored. */
const computeTotals = (
  items: InvoiceItemInput[],
  discount: number,
  tax: number
): { items: IInvoiceItem[]; subtotal: number; totalAmount: number } => {
  let subtotalCents = 0;

  const computedItems: IInvoiceItem[] = items.map((item) => {
    const totalCents = toCents(item.unitPrice) * item.quantity;
    subtotalCents += totalCents;
    return {
      itemType: item.itemType,
      referenceId: item.referenceId ? (item.referenceId as unknown as Types.ObjectId) : undefined,
      description: item.description.trim(),
      quantity: item.quantity,
      unitPrice: fromCents(toCents(item.unitPrice)),
      totalPrice: fromCents(totalCents),
    };
  });

  const discountCents = toCents(discount);
  const taxCents = toCents(tax);

  if (discountCents > subtotalCents) {
    throw new ApiError(400, 'Discount cannot exceed the subtotal.');
  }

  const totalCents = subtotalCents - discountCents + taxCents;

  return {
    items: computedItems,
    subtotal: fromCents(subtotalCents),
    totalAmount: fromCents(totalCents),
  };
};

export const createInvoice = async (
  input: CreateInvoiceInput,
  actorId: Types.ObjectId
): Promise<InvoiceDocument> => {
  const patient = await Patient.findById(input.patientId);
  if (!patient) throw new ApiError(404, 'Patient not found');

  await assertItemReferences(input.items);

  const discount = input.discount ?? 0;
  const tax = input.tax ?? 0;
  const { items, subtotal, totalAmount } = computeTotals(input.items, discount, tax);

  return Invoice.create({
    invoiceId: await nextInvoiceId(),
    patientId: patient._id,
    appointmentId: input.appointmentId,
    items,
    subtotal,
    discount: fromCents(toCents(discount)),
    tax: fromCents(toCents(tax)),
    totalAmount,
    amountPaid: 0,
    dueAmount: totalAmount,
    createdBy: actorId,
  });
};

export const updateDraftInvoice = async (
  invoice: InvoiceDocument,
  input: Pick<CreateInvoiceInput, 'items' | 'discount' | 'tax'>
): Promise<InvoiceDocument> => {
  if (invoice.invoiceStatus !== 'draft') {
    throw new ApiError(400, `A ${invoice.invoiceStatus} invoice can no longer be edited.`);
  }

  await assertItemReferences(input.items);

  const discount = input.discount ?? invoice.discount;
  const tax = input.tax ?? invoice.tax;
  const { items, subtotal, totalAmount } = computeTotals(input.items, discount, tax);

  invoice.items = items;
  invoice.subtotal = subtotal;
  invoice.discount = fromCents(toCents(discount));
  invoice.tax = fromCents(toCents(tax));
  invoice.totalAmount = totalAmount;
  invoice.dueAmount = totalAmount;
  await invoice.save();
  return invoice;
};

export const issueInvoice = async (invoice: InvoiceDocument): Promise<InvoiceDocument> => {
  if (invoice.invoiceStatus !== 'draft') {
    throw new ApiError(400, `Only draft invoices can be issued (this one is ${invoice.invoiceStatus}).`);
  }
  invoice.invoiceStatus = 'issued';
  await invoice.save();
  return invoice;
};

export const cancelInvoice = async (invoice: InvoiceDocument): Promise<InvoiceDocument> => {
  if (invoice.invoiceStatus === 'cancelled') {
    throw new ApiError(400, 'This invoice is already cancelled.');
  }
  if (invoice.amountPaid > 0) {
    throw new ApiError(400, 'Refund all payments before cancelling this invoice.');
  }
  invoice.invoiceStatus = 'cancelled';
  await invoice.save();
  return invoice;
};

// ---------------------------------------------------------------------------
// Payments & refunds
// ---------------------------------------------------------------------------

const computePaymentStatus = (
  amountPaidCents: number,
  totalCents: number,
  refundedCents: number
): InvoicePaymentStatus => {
  if (amountPaidCents >= totalCents && totalCents > 0) return 'paid';
  if (amountPaidCents > 0) return 'partially_paid';
  return refundedCents > 0 ? 'refunded' : 'unpaid';
};

/** Recomputes invoice money fields from the payments ledger (in cents). */
const settleInvoice = async (invoiceId: Types.ObjectId): Promise<void> => {
  const rows = await Payment.find({ invoiceId, status: { $ne: 'failed' } }).lean();

  let paidCents = 0;
  let refundedCents = 0;
  for (const row of rows) {
    if (row.type === 'payment') paidCents += toCents(row.amount);
    else refundedCents += toCents(row.amount);
  }

  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) return;

  const totalCents = toCents(invoice.totalAmount);
  const netPaidCents = paidCents - refundedCents;

  invoice.amountPaid = fromCents(netPaidCents);
  invoice.dueAmount = fromCents(totalCents - netPaidCents);
  invoice.paymentStatus = computePaymentStatus(netPaidCents, totalCents, refundedCents);
  await invoice.save();
};

export interface RecordPaymentInput {
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  transactionReference?: string;
  notes?: string;
}

/**
 * Records a payment with overpayment prevention that holds under
 * concurrency: an atomic guarded reserve on dueAmount admits the payment
 * only while enough balance remains (two concurrent payments for the
 * full balance → exactly one succeeds), then the invoice is settled from
 * the ledger using integer-cents arithmetic.
 */
export const recordPayment = async (
  input: RecordPaymentInput,
  actorId: Types.ObjectId
): Promise<PaymentDocument> => {
  const invoice = await Invoice.findById(input.invoiceId);
  if (!invoice) throw new ApiError(404, 'Invoice not found');

  if (invoice.invoiceStatus === 'cancelled') {
    throw new ApiError(400, 'Payments cannot be recorded against a cancelled invoice.');
  }
  if (invoice.invoiceStatus === 'draft') {
    throw new ApiError(400, 'Issue the invoice before recording payments.');
  }

  const amount = fromCents(toCents(input.amount));
  if (amount <= 0) throw new ApiError(400, 'Payment amount must be positive.');

  // Guarded atomic reserve — the concurrency-safe overpayment check.
  const reserved = await Invoice.findOneAndUpdate(
    { _id: invoice._id, invoiceStatus: 'issued', dueAmount: { $gte: amount } },
    { $inc: { dueAmount: -amount } },
    { new: true }
  );

  if (!reserved) {
    const fresh = await Invoice.findById(invoice._id);
    throw new ApiError(
      400,
      `Payment exceeds the outstanding balance (due: ${fresh?.dueAmount.toFixed(2) ?? '0.00'}).`
    );
  }

  const payment = await Payment.create({
    paymentId: await nextPaymentId(),
    invoiceId: invoice._id,
    patientId: invoice.patientId,
    type: 'payment',
    amount,
    method: input.method,
    transactionReference: input.transactionReference,
    receivedBy: actorId,
    notes: input.notes,
  });

  await settleInvoice(invoice._id);

  // Operational visibility for administrators (secondary effect).
  await notifyRoles(['admin'], {
    type: 'payment',
    title: 'Payment recorded',
    message: `${amount.toFixed(2)} received for ${invoice.invoiceId} (${input.method.replace('_', ' ')}).`,
    referenceType: 'payment',
    referenceId: payment._id,
    dedupeKey: `payment:recorded:${payment._id}`,
  });

  // Portal inbox: the patient sees their payment land.
  await notifyPatient(invoice.patientId, {
    type: 'payment',
    title: 'Payment received',
    message: `A payment of ${amount.toFixed(2)} was recorded against invoice ${invoice.invoiceId}.`,
    referenceType: 'payment',
    referenceId: payment._id,
    dedupeKey: `payment:recorded:patient:${payment._id}`,
  });

  return payment;
};

export interface RefundInput {
  paymentId: string;
  amount: number;
  notes?: string;
}

export const recordRefund = async (
  input: RefundInput,
  actorId: Types.ObjectId
): Promise<PaymentDocument> => {
  const original = await Payment.findById(input.paymentId);
  if (!original) throw new ApiError(404, 'Payment not found');
  if (original.type !== 'payment' || original.status === 'failed') {
    throw new ApiError(400, 'Refunds can only be issued against completed payments.');
  }

  const amount = fromCents(toCents(input.amount));
  if (amount <= 0) throw new ApiError(400, 'Refund amount must be positive.');

  // A payment can never be refunded beyond what was actually paid.
  const priorRefunds = await Payment.find({ refundOf: original._id }).lean();
  const refundedCents = priorRefunds.reduce((sum, r) => sum + toCents(r.amount), 0);
  const remainingCents = toCents(original.amount) - refundedCents;

  if (toCents(amount) > remainingCents) {
    throw new ApiError(
      400,
      `Refund exceeds the refundable amount (${fromCents(remainingCents).toFixed(2)} remaining on this payment).`
    );
  }

  const refund = await Payment.create({
    paymentId: await nextPaymentId(),
    invoiceId: original.invoiceId,
    patientId: original.patientId,
    type: 'refund',
    amount,
    method: original.method,
    refundOf: original._id,
    receivedBy: actorId,
    notes: input.notes,
  });

  // Fully refunded payments are flagged (record itself is never altered otherwise).
  if (toCents(amount) === remainingCents) {
    original.status = 'refunded';
    await original.save();
  }

  await settleInvoice(original.invoiceId);
  return refund;
};

// ---------------------------------------------------------------------------
// Billable sources — integration with existing modules, no duplication.
// ---------------------------------------------------------------------------

export interface BillableItem {
  itemType: InvoiceItemType;
  referenceId: string;
  description: string;
  unitPrice: number;
}

export const getBillableSources = async (patientId: string): Promise<BillableItem[]> => {
  const patient = await Patient.findById(patientId);
  if (!patient) throw new ApiError(404, 'Patient not found');

  const [consultations, labOrders, dispensings] = await Promise.all([
    Consultation.find({ patientId: patient._id, status: 'completed' })
      .select('consultationId doctorId consultationDate')
      .sort({ consultationDate: -1 })
      .limit(25)
      .lean(),
    LabOrder.find({ patientId: patient._id, status: { $ne: 'cancelled' } })
      .select('orderId tests orderedAt')
      .sort({ orderedAt: -1 })
      .limit(25)
      .lean(),
    DispensingRecord.find({ patientId: patient._id })
      .select('dispensingId items createdAt')
      .sort({ createdAt: -1 })
      .limit(25)
      .lean(),
  ]);

  const doctorIds = [...new Set(consultations.map((c) => String(c.doctorId)))];
  const doctors = await Doctor.find({ _id: { $in: doctorIds } })
    .select('firstName lastName consultationFee')
    .lean();
  const doctorMap = new Map(doctors.map((d) => [String(d._id), d]));

  const billables: BillableItem[] = [];

  for (const c of consultations) {
    const doctor = doctorMap.get(String(c.doctorId));
    billables.push({
      itemType: 'consultation',
      referenceId: String(c._id),
      description: `Consultation ${c.consultationId}${doctor ? ` — Dr. ${doctor.firstName} ${doctor.lastName}` : ''}`,
      unitPrice: fromCents(toCents(doctor?.consultationFee ?? 0)),
    });
  }

  for (const o of labOrders) {
    const priceCents = o.tests.reduce((sum, t) => sum + toCents(t.price), 0);
    billables.push({
      itemType: 'lab_order',
      referenceId: String(o._id),
      description: `Lab order ${o.orderId} (${o.tests.map((t) => t.testName).join(', ')})`,
      unitPrice: fromCents(priceCents),
    });
  }

  for (const d of dispensings) {
    const priceCents = d.items.reduce(
      (sum, item) =>
        sum + item.batches.reduce((s, b) => s + toCents(b.sellingPrice) * b.quantity, 0),
      0
    );
    billables.push({
      itemType: 'pharmacy',
      referenceId: String(d._id),
      description: `Pharmacy ${d.dispensingId} (${d.items.map((i) => i.medicineName).join(', ')})`,
      unitPrice: fromCents(priceCents),
    });
  }

  return billables;
};

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export interface BillingStats {
  todaysRevenue: number;
  totalInvoices: number;
  paidInvoices: number;
  unpaidInvoices: number;
  partiallyPaidInvoices: number;
  outstandingAmount: number;
  todaysPayments: number;
}

export const getBillingStats = async (): Promise<BillingStats> => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [todaysRows, totalInvoices, paidInvoices, unpaidInvoices, partiallyPaidInvoices, outstandingAgg, todaysPayments] =
    await Promise.all([
      Payment.find({ paidAt: { $gte: startOfDay }, status: { $ne: 'failed' } })
        .select('type amount')
        .lean(),
      Invoice.countDocuments({}),
      Invoice.countDocuments({ invoiceStatus: 'issued', paymentStatus: 'paid' }),
      Invoice.countDocuments({ invoiceStatus: 'issued', paymentStatus: 'unpaid' }),
      Invoice.countDocuments({ invoiceStatus: 'issued', paymentStatus: 'partially_paid' }),
      Invoice.aggregate([
        { $match: { invoiceStatus: 'issued' } },
        { $group: { _id: null, total: { $sum: '$dueAmount' } } },
      ]),
      Payment.countDocuments({ paidAt: { $gte: startOfDay }, type: 'payment', status: { $ne: 'failed' } }),
    ]);

  const revenueCents = todaysRows.reduce(
    (sum, row) => sum + (row.type === 'payment' ? toCents(row.amount) : -toCents(row.amount)),
    0
  );

  return {
    todaysRevenue: fromCents(revenueCents),
    totalInvoices,
    paidInvoices,
    unpaidInvoices,
    partiallyPaidInvoices,
    outstandingAmount: fromCents(
      toCents((outstandingAgg[0] as { total?: number } | undefined)?.total ?? 0)
    ),
    todaysPayments,
  };
};
