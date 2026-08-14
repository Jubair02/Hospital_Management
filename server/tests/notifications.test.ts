import './env.js';
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import createApp from '../app.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { createNotification, notifyRoles } from '../services/notificationService.js';
import { setupTestDB, createAdmin, createStaff, loginAs, ADMIN } from './helpers.js';
import {
  createDepartment,
  createActivePatient,
  createDoctorViaApi,
  setWeekdayAvailability,
  nextMonday,
} from './phase3Helpers.js';

const app = createApp();

setupTestDB();

let adminToken: string;
let adminUserId: string;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeEach(async () => {
  const admin = await createAdmin();
  adminUserId = String(admin._id);
  adminToken = await loginAs(app, ADMIN);
});

const seed = async (recipientId: string, overrides: Record<string, unknown> = {}) =>
  createNotification({
    recipientId: recipientId as unknown as never,
    type: 'system',
    title: 'Test notification',
    message: 'Something happened.',
    ...overrides,
  });

describe('notification inbox', () => {
  it('lists own notifications with unread count and pagination', async () => {
    for (let i = 0; i < 3; i += 1) {
      await seed(adminUserId, { title: `Notice ${i}`, dedupeKey: `t:${i}` });
    }

    const res = await request(app).get('/api/notifications').set(auth(adminToken)).expect(200);
    expect(res.body.data.notifications).toHaveLength(3);
    expect(res.body.data.unreadCount).toBe(3);
    expect(res.body.data.notifications[0].notificationId).toMatch(/^NTF-\d{6}$/);

    const paged = await request(app)
      .get('/api/notifications')
      .query({ page: 2, limit: 2 })
      .set(auth(adminToken))
      .expect(200);
    expect(paged.body.data.notifications).toHaveLength(1);
    expect(paged.body.data.pagination.totalPages).toBe(2);
  });

  it('marks one as read, all as read, and reports the unread count', async () => {
    const a = await seed(adminUserId, { dedupeKey: 'a' });
    await seed(adminUserId, { dedupeKey: 'b' });

    let count = await request(app)
      .get('/api/notifications/unread-count')
      .set(auth(adminToken))
      .expect(200);
    expect(count.body.data.unreadCount).toBe(2);

    await request(app)
      .patch(`/api/notifications/${a!._id}/read`)
      .set(auth(adminToken))
      .expect(200);

    count = await request(app)
      .get('/api/notifications/unread-count')
      .set(auth(adminToken))
      .expect(200);
    expect(count.body.data.unreadCount).toBe(1);

    const all = await request(app)
      .patch('/api/notifications/read-all')
      .set(auth(adminToken))
      .expect(200);
    expect(all.body.data.updated).toBe(1);

    count = await request(app)
      .get('/api/notifications/unread-count')
      .set(auth(adminToken))
      .expect(200);
    expect(count.body.data.unreadCount).toBe(0);
  });

  it('filters unread only and by type', async () => {
    const read = await seed(adminUserId, { dedupeKey: 'r' });
    await seed(adminUserId, { type: 'payment', dedupeKey: 'p' });
    await request(app)
      .patch(`/api/notifications/${read!._id}/read`)
      .set(auth(adminToken))
      .expect(200);

    const unread = await request(app)
      .get('/api/notifications')
      .query({ unread: 'true' })
      .set(auth(adminToken))
      .expect(200);
    expect(unread.body.data.notifications).toHaveLength(1);

    const byType = await request(app)
      .get('/api/notifications')
      .query({ type: 'payment' })
      .set(auth(adminToken))
      .expect(200);
    expect(byType.body.data.notifications).toHaveLength(1);
  });
});

describe('notification ownership', () => {
  it('a user never sees or mutates another user’s notifications', async () => {
    const nurseCreds = await createStaff('nurse');
    const nurse = await User.findOne({ email: nurseCreds.email });
    const nurseToken = await loginAs(app, nurseCreds);

    const adminNote = await seed(adminUserId, { dedupeKey: 'admin-only' });
    await seed(String(nurse!._id), { dedupeKey: 'nurse-only', title: 'Nurse notice' });

    // The nurse sees only their own.
    const list = await request(app).get('/api/notifications').set(auth(nurseToken)).expect(200);
    expect(list.body.data.notifications).toHaveLength(1);
    expect(list.body.data.notifications[0].title).toBe('Nurse notice');

    // Marking the admin's notification read is impossible.
    await request(app)
      .patch(`/api/notifications/${adminNote!._id}/read`)
      .set(auth(nurseToken))
      .expect(404);
    const fresh = await Notification.findById(adminNote!._id);
    expect(fresh?.isRead).toBe(false);

    // Mark-all only touches the caller's own inbox.
    await request(app).patch('/api/notifications/read-all').set(auth(nurseToken)).expect(200);
    expect((await Notification.findById(adminNote!._id))?.isRead).toBe(false);
  });

  it('requires authentication', async () => {
    await request(app).get('/api/notifications').expect(401);
    await request(app).get('/api/notifications/unread-count').expect(401);
    await request(app).patch('/api/notifications/read-all').expect(401);
  });
});

describe('duplicate prevention & role fan-out', () => {
  it('the same event never produces two notifications for one recipient', async () => {
    const first = await seed(adminUserId, { dedupeKey: 'event:42' });
    const second = await seed(adminUserId, { dedupeKey: 'event:42' });

    expect(first).not.toBeNull();
    expect(second).toBeNull(); // ignored as a duplicate
    expect(await Notification.countDocuments({ recipientId: adminUserId })).toBe(1);
  });

  it('fans out to every active user in a role, once each', async () => {
    await createStaff('pharmacist');
    await User.create({
      firstName: 'Second',
      lastName: 'Pharmacist',
      email: 'pharm2@test.local',
      password: 'StaffPass123!',
      role: 'pharmacist',
    });

    await notifyRoles(['pharmacist'], {
      type: 'low_stock',
      title: 'Low stock',
      message: 'Paracetamol is low.',
      dedupeKey: 'low_stock:x:2026-01-01',
    });
    // Repeating the same event changes nothing.
    await notifyRoles(['pharmacist'], {
      type: 'low_stock',
      title: 'Low stock',
      message: 'Paracetamol is low.',
      dedupeKey: 'low_stock:x:2026-01-01',
    });

    expect(await Notification.countDocuments({ type: 'low_stock' })).toBe(2);
  });
});

describe('notifications from real workflow events', () => {
  it('booking an appointment notifies the attending doctor', async () => {
    const departmentId = String((await createDepartment('Cardiology'))._id);
    const doctor = await createDoctorViaApi(app, adminToken, departmentId);
    await setWeekdayAvailability(app, adminToken, doctor._id);
    const patientId = String((await createActivePatient())._id);

    await request(app)
      .post('/api/appointments')
      .set(auth(adminToken))
      .send({
        patientId,
        doctorId: doctor._id,
        appointmentDate: nextMonday(),
        startTime: '10:00',
        endTime: '10:30',
        reason: 'Chest pain',
      })
      .expect(201);

    const doctorToken = await loginAs(app, { email: doctor.email, password: 'DoctorPass123!' });
    const inbox = await request(app).get('/api/notifications').set(auth(doctorToken)).expect(200);

    expect(inbox.body.data.notifications).toHaveLength(1);
    expect(inbox.body.data.notifications[0]).toMatchObject({
      type: 'appointment',
      title: 'New appointment booked',
      referenceType: 'appointment',
    });
  });

  it('a lab order notifies lab technicians and a verified result notifies the doctor', async () => {
    const labToken = await loginAs(app, await createStaff('lab_technician'));
    const departmentId = String((await createDepartment('Pathology'))._id);
    const doctor = await createDoctorViaApi(app, adminToken, departmentId);
    await setWeekdayAvailability(app, adminToken, doctor._id);
    const doctorToken = await loginAs(app, { email: doctor.email, password: 'DoctorPass123!' });
    const patientId = String((await createActivePatient())._id);

    const apt = await request(app)
      .post('/api/appointments')
      .set(auth(adminToken))
      .send({
        patientId,
        doctorId: doctor._id,
        appointmentDate: nextMonday(),
        startTime: '11:00',
        endTime: '11:30',
        reason: 'Fever',
      })
      .expect(201);

    const consultation = await request(app)
      .post('/api/consultations')
      .set(auth(doctorToken))
      .send({ appointmentId: apt.body.data.appointment._id })
      .expect(201);

    const category = await request(app)
      .post('/api/laboratory/categories')
      .set(auth(adminToken))
      .send({ name: 'Hematology' })
      .expect(201);
    const test = await request(app)
      .post('/api/laboratory/tests')
      .set(auth(adminToken))
      .send({
        name: 'CBC',
        category: category.body.data.category._id,
        sampleType: 'blood',
        price: 20,
        resultType: 'numeric',
      })
      .expect(201);

    const order = await request(app)
      .post('/api/laboratory/orders')
      .set(auth(doctorToken))
      .send({ consultationId: consultation.body.data.consultation._id, tests: [test.body.data.test._id] })
      .expect(201);

    // Lab technician was told there is work waiting.
    const labInbox = await request(app).get('/api/notifications').set(auth(labToken)).expect(200);
    expect(labInbox.body.data.notifications.some((n: { referenceType: string }) => n.referenceType === 'lab_order')).toBe(true);

    // Collect the sample, enter and verify the result.
    const detail = await request(app)
      .get(`/api/laboratory/orders/${order.body.data.order._id}`)
      .set(auth(labToken))
      .expect(200);
    await request(app)
      .patch(`/api/laboratory/samples/${detail.body.data.samples[0]._id}/collect`)
      .set(auth(labToken))
      .send({})
      .expect(200);
    const resultId = detail.body.data.results[0]._id;
    await request(app)
      .patch(`/api/laboratory/results/${resultId}`)
      .set(auth(labToken))
      .send({ value: '6.1' })
      .expect(200);
    await request(app)
      .patch(`/api/laboratory/results/${resultId}/verify`)
      .set(auth(labToken))
      .expect(200);

    const doctorInbox = await request(app)
      .get('/api/notifications')
      .query({ type: 'lab_result' })
      .set(auth(doctorToken))
      .expect(200);
    expect(doctorInbox.body.data.notifications).toHaveLength(1);
    expect(doctorInbox.body.data.notifications[0].title).toBe('Lab result verified');
  });

  it('recording a payment notifies administrators', async () => {
    const receptionistToken = await loginAs(app, await createStaff('receptionist'));
    const patientId = String((await createActivePatient())._id);

    const invoice = await request(app)
      .post('/api/billing/invoices')
      .set(auth(receptionistToken))
      .send({
        patientId,
        items: [{ itemType: 'service', description: 'Consultation fee', quantity: 1, unitPrice: 40 }],
      })
      .expect(201);
    await request(app)
      .patch(`/api/billing/invoices/${invoice.body.data.invoice._id}/status`)
      .set(auth(receptionistToken))
      .send({ status: 'issued' })
      .expect(200);
    await request(app)
      .post('/api/billing/payments')
      .set(auth(receptionistToken))
      .send({ invoiceId: invoice.body.data.invoice._id, amount: 40, method: 'cash' })
      .expect(201);

    const inbox = await request(app)
      .get('/api/notifications')
      .query({ type: 'payment' })
      .set(auth(adminToken))
      .expect(200);
    expect(inbox.body.data.notifications).toHaveLength(1);
    expect(inbox.body.data.notifications[0].message).toMatch(/40\.00/);
  });
});
