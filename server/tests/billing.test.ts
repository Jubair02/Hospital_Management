import './env.js';
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import createApp from '../app.js';
import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import { setupTestDB, createAdmin, createStaff, loginAs, ADMIN } from './helpers.js';
import { createActivePatient } from './phase3Helpers.js';

const app = createApp();

setupTestDB();

let adminToken: string;
let receptionistToken: string;
let patientId: string;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeEach(async () => {
  await createAdmin();
  adminToken = await loginAs(app, ADMIN);
  receptionistToken = await loginAs(app, await createStaff('receptionist'));
  patientId = String((await createActivePatient())._id);
});

const SERVICE_ITEMS = [
  { itemType: 'service', description: 'Registration fee', quantity: 1, unitPrice: 10.5 },
  { itemType: 'service', description: 'Dressing', quantity: 3, unitPrice: 5.25 },
];

const createInvoice = (overrides: Record<string, unknown> = {}, token = receptionistToken) =>
  request(app)
    .post('/api/billing/invoices')
    .set(auth(token))
    .send({ patientId, items: SERVICE_ITEMS, discount: 1.25, tax: 2.5, ...overrides });

const issueInvoice = async (id: string) =>
  request(app)
    .patch(`/api/billing/invoices/${id}/status`)
    .set(auth(receptionistToken))
    .send({ status: 'issued' })
    .expect(200);

const pay = (invoiceId: string, amount: number, token = receptionistToken) =>
  request(app)
    .post('/api/billing/payments')
    .set(auth(token))
    .send({ invoiceId, amount, method: 'cash' });

/** Draft + issued invoice ready for payments; total = 27.50. */
const issuedInvoice = async (): Promise<{ _id: string; totalAmount: number }> => {
  const res = await createInvoice().expect(201);
  const invoice = res.body.data.invoice;
  await issueInvoice(invoice._id);
  return invoice;
};

describe('invoice creation & calculation', () => {
  it('computes totals on the backend with cents-exact arithmetic', async () => {
    const res = await createInvoice().expect(201);
    const invoice = res.body.data.invoice;

    expect(invoice.invoiceId).toBe('INV-000001');
    expect(invoice.invoiceStatus).toBe('draft');
    // 10.50 + 3×5.25 = 26.25; -1.25 discount +2.50 tax = 27.50
    expect(invoice.subtotal).toBe(26.25);
    expect(invoice.totalAmount).toBe(27.5);
    expect(invoice.amountPaid).toBe(0);
    expect(invoice.dueAmount).toBe(27.5);
    expect(invoice.items[1].totalPrice).toBe(15.75);
    expect(invoice.paymentStatus).toBe('unpaid');
  });

  it('ignores any totals the client tries to send', async () => {
    const res = await createInvoice({
      subtotal: 1,
      totalAmount: 1,
      items: [
        { itemType: 'service', description: 'X', quantity: 2, unitPrice: 7, totalPrice: 0.01 },
      ],
      discount: 0,
      tax: 0,
    }).expect(201);

    expect(res.body.data.invoice.totalAmount).toBe(14);
    expect(res.body.data.invoice.items[0].totalPrice).toBe(14);
  });

  it('rejects negative amounts, empty items, and oversized discounts', async () => {
    await createInvoice({ items: [] }).expect(400);
    await createInvoice({
      items: [{ itemType: 'service', description: 'X', quantity: 1, unitPrice: -5 }],
    }).expect(400);
    await createInvoice({ discount: -1 }).expect(400);
    await createInvoice({ discount: 1000 }).expect(400); // > subtotal
    await createInvoice({
      items: [{ itemType: 'service', description: 'X', quantity: 0, unitPrice: 5 }],
    }).expect(400);
  });

  it('validates item references against real records', async () => {
    await createInvoice({
      items: [
        {
          itemType: 'consultation',
          referenceId: '64b000000000000000000000',
          description: 'Consultation',
          quantity: 1,
          unitPrice: 100,
        },
      ],
    }).expect(404);

    await createInvoice({
      items: [{ itemType: 'lab_order', description: 'No reference', quantity: 1, unitPrice: 10 }],
    }).expect(400);
  });

  it('rejects unknown patients', async () => {
    await createInvoice({ patientId: '64b000000000000000000000' }).expect(404);
  });
});

describe('invoice lifecycle', () => {
  it('drafts are editable and recalculated; issued invoices are locked', async () => {
    const res = await createInvoice().expect(201);
    const invoice = res.body.data.invoice;

    const updated = await request(app)
      .patch(`/api/billing/invoices/${invoice._id}`)
      .set(auth(receptionistToken))
      .send({
        items: [{ itemType: 'service', description: 'Only one', quantity: 1, unitPrice: 50 }],
        discount: 0,
        tax: 0,
      })
      .expect(200);
    expect(updated.body.data.invoice.totalAmount).toBe(50);

    await issueInvoice(invoice._id);

    await request(app)
      .patch(`/api/billing/invoices/${invoice._id}`)
      .set(auth(receptionistToken))
      .send({ items: SERVICE_ITEMS })
      .expect(400);

    // Re-issuing is invalid too.
    await request(app)
      .patch(`/api/billing/invoices/${invoice._id}/status`)
      .set(auth(receptionistToken))
      .send({ status: 'issued' })
      .expect(400);
  });

  it('cancellation is admin-only, blocked once paid, and keeps the record', async () => {
    const invoice = await issuedInvoice();

    await request(app)
      .patch(`/api/billing/invoices/${invoice._id}/status`)
      .set(auth(receptionistToken))
      .send({ status: 'cancelled' })
      .expect(403);

    await pay(invoice._id, 10).expect(201);
    await request(app)
      .patch(`/api/billing/invoices/${invoice._id}/status`)
      .set(auth(adminToken))
      .send({ status: 'cancelled' })
      .expect(400); // must refund first

    const second = await issuedInvoice();
    await request(app)
      .patch(`/api/billing/invoices/${second._id}/status`)
      .set(auth(adminToken))
      .send({ status: 'cancelled' })
      .expect(200);
    expect(await Invoice.countDocuments({})).toBe(2); // record kept

    // Cancelled invoices reject payments.
    await pay(second._id, 5).expect(400);
  });

  it('drafts cannot receive payments', async () => {
    const res = await createInvoice().expect(201);
    await pay(res.body.data.invoice._id, 5).expect(400);
  });
});

describe('payments', () => {
  it('partial then full payment updates amounts and status', async () => {
    const invoice = await issuedInvoice(); // total 27.50

    await pay(invoice._id, 10).expect(201);
    let fresh = await Invoice.findById(invoice._id);
    expect(fresh?.amountPaid).toBe(10);
    expect(fresh?.dueAmount).toBe(17.5);
    expect(fresh?.paymentStatus).toBe('partially_paid');

    await pay(invoice._id, 17.5).expect(201);
    fresh = await Invoice.findById(invoice._id);
    expect(fresh?.amountPaid).toBe(27.5);
    expect(fresh?.dueAmount).toBe(0);
    expect(fresh?.paymentStatus).toBe('paid');
  });

  it('prevents overpayment, zero, and negative amounts', async () => {
    const invoice = await issuedInvoice();

    const over = await pay(invoice._id, 100).expect(400);
    expect(over.body.message).toMatch(/outstanding balance/i);
    await pay(invoice._id, 0).expect(400);
    await pay(invoice._id, -5).expect(400);

    const fresh = await Invoice.findById(invoice._id);
    expect(fresh?.amountPaid).toBe(0);
    expect(fresh?.dueAmount).toBe(27.5);
  });

  it('two concurrent full payments cannot both succeed', async () => {
    const invoice = await issuedInvoice();

    const [a, b] = await Promise.all([
      pay(invoice._id, 27.5, adminToken).then((r) => r.status),
      pay(invoice._id, 27.5, receptionistToken).then((r) => r.status),
    ]);

    expect([a, b].filter((s) => s === 201)).toHaveLength(1);
    expect([a, b].filter((s) => s === 400)).toHaveLength(1);

    const fresh = await Invoice.findById(invoice._id);
    expect(fresh?.amountPaid).toBe(27.5);
    expect(fresh?.dueAmount).toBe(0);
  });

  it('lists payments with filters', async () => {
    const invoice = await issuedInvoice();
    await pay(invoice._id, 10).expect(201);
    await request(app)
      .post('/api/billing/payments')
      .set(auth(receptionistToken))
      .send({ invoiceId: invoice._id, amount: 5, method: 'card', transactionReference: 'TX-1' })
      .expect(201);

    const byMethod = await request(app)
      .get('/api/billing/payments')
      .query({ method: 'card' })
      .set(auth(receptionistToken))
      .expect(200);
    expect(byMethod.body.data.payments).toHaveLength(1);

    const byPatient = await request(app)
      .get('/api/billing/payments')
      .query({ patientId })
      .set(auth(receptionistToken))
      .expect(200);
    expect(byPatient.body.data.payments).toHaveLength(2);

    const none = await request(app)
      .get('/api/billing/payments')
      .query({ dateFrom: '2099-01-01' })
      .set(auth(receptionistToken))
      .expect(200);
    expect(none.body.data.payments).toHaveLength(0);
  });
});

describe('refunds', () => {
  it('refunds create ledger rows, update the invoice, and never exceed the paid amount', async () => {
    const invoice = await issuedInvoice();
    const paymentRes = await pay(invoice._id, 20).expect(201);
    const paymentId = paymentRes.body.data.payment._id as string;

    // Refund limit: cannot exceed what was paid.
    await request(app)
      .post('/api/billing/refunds')
      .set(auth(adminToken))
      .send({ paymentId, amount: 25 })
      .expect(400);

    // Partial refund.
    await request(app)
      .post('/api/billing/refunds')
      .set(auth(adminToken))
      .send({ paymentId, amount: 5, notes: 'Overcharge correction' })
      .expect(201);

    let fresh = await Invoice.findById(invoice._id);
    expect(fresh?.amountPaid).toBe(15);
    expect(fresh?.dueAmount).toBe(12.5);
    expect(fresh?.paymentStatus).toBe('partially_paid');

    // Refund the remainder of the payment — original flagged refunded.
    await request(app)
      .post('/api/billing/refunds')
      .set(auth(adminToken))
      .send({ paymentId, amount: 15 })
      .expect(201);

    const original = await Payment.findById(paymentId);
    expect(original?.status).toBe('refunded');

    fresh = await Invoice.findById(invoice._id);
    expect(fresh?.amountPaid).toBe(0);
    expect(fresh?.paymentStatus).toBe('refunded');

    // Nothing left to refund.
    await request(app)
      .post('/api/billing/refunds')
      .set(auth(adminToken))
      .send({ paymentId, amount: 1 })
      .expect(400);

    // Ledger: 1 payment + 2 refunds, nothing deleted.
    expect(await Payment.countDocuments({ invoiceId: invoice._id })).toBe(3);
  });

  it('refunds are admin-only', async () => {
    const invoice = await issuedInvoice();
    const paymentRes = await pay(invoice._id, 10).expect(201);

    await request(app)
      .post('/api/billing/refunds')
      .set(auth(receptionistToken))
      .send({ paymentId: paymentRes.body.data.payment._id, amount: 5 })
      .expect(403);
  });
});

describe('billing RBAC', () => {
  it('doctor and nurse read invoices but cannot write; pharmacist/lab have no access', async () => {
    const invoice = await issuedInvoice();

    for (const role of ['doctor', 'nurse'] as const) {
      const token = await loginAs(app, await createStaff(role));
      await request(app).get('/api/billing/invoices').set(auth(token)).expect(200);
      await request(app).get(`/api/billing/invoices/${invoice._id}`).set(auth(token)).expect(200);
      await createInvoice({}, token).expect(403);
      await pay(invoice._id, 5, token).expect(403);
    }

    for (const role of ['pharmacist', 'lab_technician'] as const) {
      const token = await loginAs(app, await createStaff(role));
      await request(app).get('/api/billing/invoices').set(auth(token)).expect(403);
      await request(app).get('/api/billing/stats').set(auth(token)).expect(403);
    }

    await request(app).get('/api/billing/invoices').expect(401);
  });

  it('filters invoices by patient for the billing history view', async () => {
    await issuedInvoice();
    const otherPatient = await createActivePatient({ phone: '555-9999' });
    const res = await request(app)
      .get('/api/billing/invoices')
      .query({ patientId: String(otherPatient._id) })
      .set(auth(receptionistToken))
      .expect(200);
    expect(res.body.data.invoices).toHaveLength(0);
  });
});

describe('GET /api/billing/stats', () => {
  it('returns real revenue and invoice counts', async () => {
    const a = await issuedInvoice(); // 27.50
    await issuedInvoice(); // unpaid
    await pay(a._id, 27.5).expect(201);

    const stats = (
      await request(app).get('/api/billing/stats').set(auth(receptionistToken)).expect(200)
    ).body.data;

    expect(stats).toMatchObject({
      todaysRevenue: 27.5,
      totalInvoices: 2,
      paidInvoices: 1,
      unpaidInvoices: 1,
      partiallyPaidInvoices: 0,
      outstandingAmount: 27.5,
      todaysPayments: 1,
    });
  });
});
