import type { FilterQuery } from 'mongoose';
import Invoice, { type IInvoice } from '../models/Invoice.js';
import Payment, { type IPayment } from '../models/Payment.js';
import Patient from '../models/Patient.js';
import {
  createInvoice,
  updateDraftInvoice,
  issueInvoice,
  cancelInvoice,
  recordPayment,
  recordRefund,
  getBillableSources,
  getBillingStats,
  type CreateInvoiceInput,
  type RecordPaymentInput,
  type RefundInput,
} from '../services/billingService.js';
import { toCalendarDate } from '../services/appointmentService.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { escapeRegex } from '../utils/escapeRegex.js';

const queryString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;


const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const paging = (query: Record<string, unknown>) => {
  const page = Math.max(parseInt(queryString(query.page) ?? '', 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(queryString(query.limit) ?? '', 10) || 10, 1), 100);
  return { page, limit };
};

const meta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.max(Math.ceil(total / limit), 1),
});

const INVOICE_POPULATE = [
  { path: 'patientId', select: 'patientId firstName lastName phone' },
  { path: 'createdBy', select: 'firstName lastName role' },
];

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export const postInvoice = asyncHandler(async (req, res) => {
  const invoice = await createInvoice(req.body as CreateInvoiceInput, req.user!._id);

  await req.audit({
    action: 'invoice_created',
    resourceType: 'invoice',
    resourceId: invoice._id,
    description: `Created draft invoice ${invoice.invoiceId} for ${invoice.totalAmount.toFixed(2)}.`,
    metadata: { invoiceId: invoice.invoiceId, total: invoice.totalAmount, items: invoice.items.length },
  });

  await invoice.populate(INVOICE_POPULATE);

  res.status(201).json({ success: true, message: 'Invoice created (draft)', data: { invoice } });
});

export const getInvoices = asyncHandler(async (req, res) => {
  const { page, limit } = paging(req.query as Record<string, unknown>);

  const filter: FilterQuery<IInvoice> = {};

  const invoiceStatus = queryString(req.query.invoiceStatus);
  if (invoiceStatus) filter.invoiceStatus = invoiceStatus as IInvoice['invoiceStatus'];
  const paymentStatus = queryString(req.query.paymentStatus);
  if (paymentStatus) filter.paymentStatus = paymentStatus as IInvoice['paymentStatus'];
  const patientId = queryString(req.query.patientId);
  if (patientId) filter.patientId = patientId;

  const dateFrom = queryString(req.query.dateFrom);
  const dateTo = queryString(req.query.dateTo);
  if ((dateFrom && DATE_RE.test(dateFrom)) || (dateTo && DATE_RE.test(dateTo))) {
    const to = dateTo && DATE_RE.test(dateTo) ? toCalendarDate(dateTo) : undefined;
    if (to) to.setUTCDate(to.getUTCDate() + 1);
    filter.createdAt = {
      ...(dateFrom && DATE_RE.test(dateFrom) ? { $gte: toCalendarDate(dateFrom) } : {}),
      ...(to ? { $lt: to } : {}),
    };
  }

  const search = queryString(req.query.search);
  if (search) {
    const rx = { $regex: escapeRegex(search.trim()), $options: 'i' };
    const patients = await Patient.find({
      $or: [{ patientId: rx }, { firstName: rx }, { lastName: rx }],
    })
      .select('_id')
      .limit(200)
      .lean();
    filter.$or = [{ invoiceId: rx }, { patientId: { $in: patients.map((p) => p._id) } }];
  }

  const [invoices, total] = await Promise.all([
    Invoice.find(filter)
      .populate(INVOICE_POPULATE)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Invoice.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Invoices fetched',
    data: { invoices, pagination: meta(page, limit, total) },
  });
});

export const getInvoiceById = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id).populate(INVOICE_POPULATE);
  if (!invoice) throw new ApiError(404, 'Invoice not found');

  const payments = await Payment.find({ invoiceId: invoice._id })
    .populate('receivedBy', 'firstName lastName')
    .sort({ paidAt: -1 });

  res.json({ success: true, message: 'Invoice fetched', data: { invoice, payments } });
});

export const patchInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) throw new ApiError(404, 'Invoice not found');

  await updateDraftInvoice(
    invoice,
    req.body as Pick<CreateInvoiceInput, 'items' | 'discount' | 'tax'>
  );
  await invoice.populate(INVOICE_POPULATE);

  res.json({ success: true, message: 'Invoice updated', data: { invoice } });
});

export const patchInvoiceStatus = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) throw new ApiError(404, 'Invoice not found');

  const { status } = req.body as { status: 'issued' | 'cancelled' };

  if (status === 'cancelled' && req.user!.role !== 'admin') {
    throw new ApiError(403, 'Only administrators can cancel invoices.');
  }

  const updated = status === 'issued' ? await issueInvoice(invoice) : await cancelInvoice(invoice);

  await req.audit({
    action: status === 'issued' ? 'invoice_issued' : 'invoice_cancelled',
    resourceType: 'invoice',
    resourceId: updated._id,
    description: `Invoice ${updated.invoiceId} ${status}.`,
    metadata: { invoiceId: updated.invoiceId, total: updated.totalAmount },
  });

  await updated.populate(INVOICE_POPULATE);

  res.json({
    success: true,
    message: `Invoice ${status === 'issued' ? 'issued' : 'cancelled'}`,
    data: { invoice: updated },
  });
});

// ---------------------------------------------------------------------------
// Billable sources
// ---------------------------------------------------------------------------

export const getBillables = asyncHandler(async (req, res) => {
  const billables = await getBillableSources(req.params.patientId as string);
  res.json({ success: true, message: 'Billable records fetched', data: { billables } });
});

// ---------------------------------------------------------------------------
// Payments & refunds
// ---------------------------------------------------------------------------

export const postPayment = asyncHandler(async (req, res) => {
  const payment = await recordPayment(req.body as RecordPaymentInput, req.user!._id);

  await req.audit({
    action: 'payment_recorded',
    resourceType: 'payment',
    resourceId: payment._id,
    // Amount and method only — never a card number or any credential.
    description: `Recorded ${payment.amount.toFixed(2)} via ${payment.method} (${payment.paymentId}).`,
    metadata: { paymentId: payment.paymentId, amount: payment.amount, method: payment.method },
  });

  await payment.populate([
    { path: 'invoiceId', select: 'invoiceId totalAmount amountPaid dueAmount paymentStatus' },
    { path: 'receivedBy', select: 'firstName lastName' },
  ]);

  res.status(201).json({ success: true, message: 'Payment recorded', data: { payment } });
});

export const getPayments = asyncHandler(async (req, res) => {
  const { page, limit } = paging(req.query as Record<string, unknown>);

  const filter: FilterQuery<IPayment> = {};

  const method = queryString(req.query.method);
  if (method) filter.method = method as IPayment['method'];
  const status = queryString(req.query.status);
  if (status) filter.status = status as IPayment['status'];
  const type = queryString(req.query.type);
  if (type) filter.type = type as IPayment['type'];
  const invoiceId = queryString(req.query.invoiceId);
  if (invoiceId) filter.invoiceId = invoiceId;
  const patientId = queryString(req.query.patientId);
  if (patientId) filter.patientId = patientId;

  const dateFrom = queryString(req.query.dateFrom);
  const dateTo = queryString(req.query.dateTo);
  if ((dateFrom && DATE_RE.test(dateFrom)) || (dateTo && DATE_RE.test(dateTo))) {
    const to = dateTo && DATE_RE.test(dateTo) ? toCalendarDate(dateTo) : undefined;
    if (to) to.setUTCDate(to.getUTCDate() + 1);
    filter.paidAt = {
      ...(dateFrom && DATE_RE.test(dateFrom) ? { $gte: toCalendarDate(dateFrom) } : {}),
      ...(to ? { $lt: to } : {}),
    };
  }

  const search = queryString(req.query.search);
  if (search) {
    const rx = { $regex: escapeRegex(search.trim()), $options: 'i' };
    const patients = await Patient.find({
      $or: [{ patientId: rx }, { firstName: rx }, { lastName: rx }],
    })
      .select('_id')
      .limit(200)
      .lean();
    filter.$or = [{ paymentId: rx }, { patientId: { $in: patients.map((p) => p._id) } }];
  }

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .populate({ path: 'invoiceId', select: 'invoiceId' })
      .populate('patientId', 'patientId firstName lastName')
      .populate('receivedBy', 'firstName lastName')
      .sort({ paidAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Payment.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Payments fetched',
    data: { payments, pagination: meta(page, limit, total) },
  });
});

export const getPaymentById = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id)
    .populate({ path: 'invoiceId', select: 'invoiceId totalAmount paymentStatus' })
    .populate('patientId', 'patientId firstName lastName')
    .populate('receivedBy', 'firstName lastName');
  if (!payment) throw new ApiError(404, 'Payment not found');

  res.json({ success: true, message: 'Payment fetched', data: { payment } });
});

export const postRefund = asyncHandler(async (req, res) => {
  const refund = await recordRefund(req.body as RefundInput, req.user!._id);

  await req.audit({
    action: 'refund_recorded',
    resourceType: 'payment',
    resourceId: refund._id,
    description: `Recorded refund of ${refund.amount.toFixed(2)} (${refund.paymentId}).`,
    metadata: { paymentId: refund.paymentId, amount: refund.amount, refundOf: String(refund.refundOf) },
  });

  await refund.populate([
    { path: 'invoiceId', select: 'invoiceId totalAmount amountPaid dueAmount paymentStatus' },
    { path: 'receivedBy', select: 'firstName lastName' },
  ]);

  res.status(201).json({ success: true, message: 'Refund recorded', data: { refund } });
});

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export const getStats = asyncHandler(async (_req, res) => {
  const stats = await getBillingStats();
  res.json({ success: true, message: 'Billing statistics fetched', data: stats });
});
