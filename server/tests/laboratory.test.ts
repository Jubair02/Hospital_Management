import './env.js';
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import createApp from '../app.js';
import LabOrder from '../models/LabOrder.js';
import { setupTestDB, createAdmin, createStaff, loginAs, ADMIN } from './helpers.js';
import {
  createDepartment,
  createActivePatient,
  createDoctorViaApi,
  setWeekdayAvailability,
  nextMonday,
  type DoctorJson,
} from './phase3Helpers.js';

const app = createApp();

setupTestDB();

let adminToken: string;
let labToken: string;
let doctor: DoctorJson;
let doctorToken: string;
let patientId: string;
let consultationId: string;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Completed consultation to hang lab orders off (doctor owns it). */
const buildConsultation = async (): Promise<void> => {
  const departmentId = String((await createDepartment(`Dept-${Math.random().toString(36).slice(2, 8)}`))._id);
  doctor = await createDoctorViaApi(app, adminToken, departmentId);
  await setWeekdayAvailability(app, adminToken, doctor._id);
  doctorToken = await loginAs(app, { email: doctor.email, password: 'DoctorPass123!' });
  patientId = String((await createActivePatient())._id);

  const apt = await request(app)
    .post('/api/appointments')
    .set(auth(adminToken))
    .send({
      patientId,
      doctorId: doctor._id,
      appointmentDate: nextMonday(),
      startTime: '10:00',
      endTime: '10:30',
      reason: 'Fever',
    })
    .expect(201);

  const started = await request(app)
    .post('/api/consultations')
    .set(auth(doctorToken))
    .send({ appointmentId: apt.body.data.appointment._id })
    .expect(201);
  consultationId = started.body.data.consultation._id as string;
};

const createLabCategory = async (name = 'Hematology'): Promise<string> => {
  const res = await request(app)
    .post('/api/laboratory/categories')
    .set(auth(adminToken))
    .send({ name })
    .expect(201);
  return res.body.data.category._id as string;
};

const createLabTest = async (
  overrides: Record<string, unknown> = {},
  categoryId?: string
): Promise<{ _id: string; testId: string }> => {
  const category = categoryId ?? (await createLabCategory(`Cat-${Math.random().toString(36).slice(2, 8)}`));
  const res = await request(app)
    .post('/api/laboratory/tests')
    .set(auth(adminToken))
    .send({
      name: 'Complete Blood Count',
      category,
      sampleType: 'blood',
      price: 25,
      resultType: 'numeric',
      unit: 'x10^9/L',
      referenceRange: '4.0–11.0',
      turnaroundTime: '24 hours',
      ...overrides,
    })
    .expect(201);
  return res.body.data.test;
};

const orderTests = (testIds: string[], overrides: Record<string, unknown> = {}) =>
  request(app)
    .post('/api/laboratory/orders')
    .set(auth(doctorToken))
    .send({ consultationId, tests: testIds, priority: 'routine', ...overrides });

beforeEach(async () => {
  await createAdmin();
  adminToken = await loginAs(app, ADMIN);
  labToken = await loginAs(app, await createStaff('lab_technician'));
  await buildConsultation();
});

describe('catalog: categories & tests', () => {
  it('admin manages categories; duplicates rejected; lab tech cannot manage', async () => {
    const res = await request(app)
      .post('/api/laboratory/categories')
      .set(auth(adminToken))
      .send({ name: 'Biochemistry' })
      .expect(201);
    expect(res.body.data.category.categoryId).toBe('LCAT-001');

    await request(app)
      .post('/api/laboratory/categories')
      .set(auth(adminToken))
      .send({ name: 'Biochemistry' })
      .expect(409);

    await request(app)
      .post('/api/laboratory/categories')
      .set(auth(labToken))
      .send({ name: 'Blocked' })
      .expect(403);
  });

  it('creates, edits, searches, filters, and deactivates tests', async () => {
    const test = await createLabTest();
    expect(test.testId).toMatch(/^LAB-\d{4}$/);
    await createLabTest({ name: 'Urinalysis', sampleType: 'urine', resultType: 'text' });

    const byName = await request(app)
      .get('/api/laboratory/tests')
      .query({ search: 'blood count' })
      .set(auth(doctorToken))
      .expect(200);
    expect(byName.body.data.tests).toHaveLength(1);

    const bySample = await request(app)
      .get('/api/laboratory/tests')
      .query({ sampleType: 'urine' })
      .set(auth(labToken))
      .expect(200);
    expect(bySample.body.data.tests).toHaveLength(1);

    await request(app)
      .patch(`/api/laboratory/tests/${test._id}`)
      .set(auth(adminToken))
      .send({ price: 30 })
      .expect(200);

    await request(app)
      .patch(`/api/laboratory/tests/${test._id}/status`)
      .set(auth(adminToken))
      .send({ status: 'inactive' })
      .expect(200);

    // Inactive tests cannot be ordered.
    await orderTests([test._id]).expect(400);
  });

  it('validates test payloads', async () => {
    await request(app)
      .post('/api/laboratory/tests')
      .set(auth(adminToken))
      .send({ name: 'X' })
      .expect(400);
    const cat = await createLabCategory('V');
    await request(app)
      .post('/api/laboratory/tests')
      .set(auth(adminToken))
      .send({ name: 'X', category: cat, sampleType: 'plasma', price: 5 })
      .expect(400);
    await request(app)
      .post('/api/laboratory/tests')
      .set(auth(adminToken))
      .send({ name: 'X', category: cat, sampleType: 'blood', price: -5 })
      .expect(400);
  });
});

describe('lab orders', () => {
  it('doctor orders tests; relations derived from the consultation; samples + results auto-created', async () => {
    const blood = await createLabTest();
    const urine = await createLabTest({ name: 'Urinalysis', sampleType: 'urine', resultType: 'text' });

    const res = await orderTests([blood._id, urine._id], { clinicalNotes: 'Rule out infection' }).expect(201);
    const order = res.body.data.order;

    expect(order.orderId).toBe('ORD-000001');
    expect(order.status).toBe('ordered');
    expect(order.patientId._id).toBe(patientId);
    expect(order.doctorId._id).toBe(doctor._id);
    expect(order.tests).toHaveLength(2);

    const detail = await request(app)
      .get(`/api/laboratory/orders/${order._id}`)
      .set(auth(labToken))
      .expect(200);
    // Two distinct sample types → two samples; two tests → two pending results.
    expect(detail.body.data.samples).toHaveLength(2);
    expect(detail.body.data.results).toHaveLength(2);
    expect(detail.body.data.results[0].status).toBe('pending');
  });

  it("a doctor cannot order for another doctor's consultation; only doctors can order", async () => {
    const blood = await createLabTest();
    const otherDept = String((await createDepartment('Other'))._id);
    const doctorB = await createDoctorViaApi(app, adminToken, otherDept);
    const tokenB = await loginAs(app, { email: doctorB.email, password: 'DoctorPass123!' });

    await request(app)
      .post('/api/laboratory/orders')
      .set(auth(tokenB))
      .send({ consultationId, tests: [blood._id] })
      .expect(403);

    await request(app)
      .post('/api/laboratory/orders')
      .set(auth(labToken))
      .send({ consultationId, tests: [blood._id] })
      .expect(403);
  });

  it('rejects unknown tests, unknown consultations, and inactive patients', async () => {
    const blood = await createLabTest();
    await orderTests(['64b000000000000000000000']).expect(404);
    await request(app)
      .post('/api/laboratory/orders')
      .set(auth(doctorToken))
      .send({ consultationId: '64b000000000000000000000', tests: [blood._id] })
      .expect(404);

    await request(app)
      .patch(`/api/patients/${patientId}/status`)
      .set(auth(adminToken))
      .send({ status: 'inactive' })
      .expect(200);
    await orderTests([blood._id]).expect(400);
  });

  it('filters and paginates orders', async () => {
    const blood = await createLabTest();
    await orderTests([blood._id]).expect(201);
    await orderTests([blood._id], { priority: 'urgent' }).expect(201);

    const urgent = await request(app)
      .get('/api/laboratory/orders')
      .query({ priority: 'urgent' })
      .set(auth(labToken))
      .expect(200);
    expect(urgent.body.data.orders).toHaveLength(1);

    const byPatient = await request(app)
      .get('/api/laboratory/orders')
      .query({ patientId })
      .set(auth(labToken))
      .expect(200);
    expect(byPatient.body.data.orders).toHaveLength(2);

    const paged = await request(app)
      .get('/api/laboratory/orders')
      .query({ page: 2, limit: 1 })
      .set(auth(labToken))
      .expect(200);
    expect(paged.body.data.orders).toHaveLength(1);
    expect(paged.body.data.pagination.totalPages).toBe(2);

    const none = await request(app)
      .get('/api/laboratory/orders')
      .query({ dateFrom: '2099-01-01' })
      .set(auth(labToken))
      .expect(200);
    expect(none.body.data.orders).toHaveLength(0);
  });
});

describe('sample workflow', () => {
  let orderId: string;
  let sampleId: string;

  beforeEach(async () => {
    const blood = await createLabTest();
    const res = await orderTests([blood._id]).expect(201);
    orderId = res.body.data.order._id;
    const detail = await request(app)
      .get(`/api/laboratory/orders/${orderId}`)
      .set(auth(labToken))
      .expect(200);
    sampleId = detail.body.data.samples[0]._id;
  });

  it('collecting all samples advances the order and moves results to processing', async () => {
    await request(app)
      .patch(`/api/laboratory/samples/${sampleId}/collect`)
      .set(auth(labToken))
      .send({ notes: 'Fasting sample' })
      .expect(200);

    const detail = await request(app)
      .get(`/api/laboratory/orders/${orderId}`)
      .set(auth(labToken))
      .expect(200);
    expect(detail.body.data.order.status).toBe('sample_collected');
    expect(detail.body.data.samples[0].status).toBe('collected');
    expect(detail.body.data.results[0].status).toBe('processing');
  });

  it('rejection requires a reason and blocks processing', async () => {
    await request(app)
      .patch(`/api/laboratory/samples/${sampleId}/reject`)
      .set(auth(labToken))
      .send({})
      .expect(400);

    await request(app)
      .patch(`/api/laboratory/samples/${sampleId}/reject`)
      .set(auth(labToken))
      .send({ reason: 'Hemolyzed sample' })
      .expect(200);

    // A rejected sample cannot be collected or processed.
    await request(app)
      .patch(`/api/laboratory/samples/${sampleId}/collect`)
      .set(auth(labToken))
      .send({})
      .expect(400);

    const detail = await request(app)
      .get(`/api/laboratory/orders/${orderId}`)
      .set(auth(labToken))
      .expect(200);
    const resultId = detail.body.data.results[0]._id;
    const res = await request(app)
      .patch(`/api/laboratory/results/${resultId}`)
      .set(auth(labToken))
      .send({ value: '5.5' })
      .expect(400);
    expect(res.body.message).toMatch(/rejected/i);
  });

  it('cancelled orders cannot be processed', async () => {
    await request(app)
      .patch(`/api/laboratory/orders/${orderId}/status`)
      .set(auth(labToken))
      .send({ status: 'cancelled' })
      .expect(200);

    await request(app)
      .patch(`/api/laboratory/samples/${sampleId}/collect`)
      .set(auth(labToken))
      .send({})
      .expect(400);

    // Only cancellation is allowed as a direct status change.
    await request(app)
      .patch(`/api/laboratory/orders/${orderId}/status`)
      .set(auth(labToken))
      .send({ status: 'completed' })
      .expect(400);
  });
});

describe('result workflow', () => {
  let orderId: string;
  let resultId: string;

  const collectAll = async () => {
    const detail = await request(app)
      .get(`/api/laboratory/orders/${orderId}`)
      .set(auth(labToken))
      .expect(200);
    for (const sample of detail.body.data.samples) {
      await request(app)
        .patch(`/api/laboratory/samples/${sample._id}/collect`)
        .set(auth(labToken))
        .send({})
        .expect(200);
    }
    return request(app).get(`/api/laboratory/orders/${orderId}`).set(auth(labToken)).expect(200);
  };

  beforeEach(async () => {
    const blood = await createLabTest();
    const res = await orderTests([blood._id]).expect(201);
    orderId = res.body.data.order._id;
    const detail = await request(app)
      .get(`/api/laboratory/orders/${orderId}`)
      .set(auth(labToken))
      .expect(200);
    resultId = detail.body.data.results[0]._id;
  });

  it('cannot enter a result before sample collection', async () => {
    const res = await request(app)
      .patch(`/api/laboratory/results/${resultId}`)
      .set(auth(labToken))
      .send({ value: '5.5' })
      .expect(400);
    expect(res.body.message).toMatch(/collect the sample/i);
  });

  it('validates value formats per test result type', async () => {
    await collectAll();

    // numeric test rejects text
    await request(app)
      .patch(`/api/laboratory/results/${resultId}`)
      .set(auth(labToken))
      .send({ value: 'not-a-number' })
      .expect(400);

    // positive/negative test rejects other values
    const pn = await createLabTest({ name: 'Malaria antigen', resultType: 'positive_negative' });
    const pnOrder = await orderTests([pn._id]).expect(201);
    const pnOrderId = pnOrder.body.data.order._id;
    const pnDetail = await request(app)
      .get(`/api/laboratory/orders/${pnOrderId}`)
      .set(auth(labToken))
      .expect(200);
    await request(app)
      .patch(`/api/laboratory/samples/${pnDetail.body.data.samples[0]._id}/collect`)
      .set(auth(labToken))
      .send({})
      .expect(200);
    const pnResultId = pnDetail.body.data.results[0]._id;
    await request(app)
      .patch(`/api/laboratory/results/${pnResultId}`)
      .set(auth(labToken))
      .send({ value: 'maybe' })
      .expect(400);
    await request(app)
      .patch(`/api/laboratory/results/${pnResultId}`)
      .set(auth(labToken))
      .send({ value: 'Negative' })
      .expect(200);
  });

  it('entry → verification completes the order; verified results are read-only', async () => {
    await collectAll();

    const entered = await request(app)
      .patch(`/api/laboratory/results/${resultId}`)
      .set(auth(labToken))
      .send({ value: '7.2', interpretation: 'Within normal limits' })
      .expect(200);
    expect(entered.body.data.result.status).toBe('completed');
    expect(entered.body.data.result.performedBy).toBeTruthy();

    // Order is processing after entry.
    let detail = await request(app)
      .get(`/api/laboratory/orders/${orderId}`)
      .set(auth(labToken))
      .expect(200);
    expect(detail.body.data.order.status).toBe('processing');

    // Verify → result locked, order completed.
    const verified = await request(app)
      .patch(`/api/laboratory/results/${resultId}/verify`)
      .set(auth(labToken))
      .expect(200);
    expect(verified.body.data.result.status).toBe('verified');

    detail = await request(app)
      .get(`/api/laboratory/orders/${orderId}`)
      .set(auth(labToken))
      .expect(200);
    expect(detail.body.data.order.status).toBe('completed');

    // Read-only from here.
    const blocked = await request(app)
      .patch(`/api/laboratory/results/${resultId}`)
      .set(auth(labToken))
      .send({ value: '9.9' })
      .expect(400);
    expect(blocked.body.message).toMatch(/read-only/i);
    await request(app)
      .patch(`/api/laboratory/results/${resultId}/verify`)
      .set(auth(labToken))
      .expect(400);

    // Completed orders cannot be cancelled or modified.
    await request(app)
      .patch(`/api/laboratory/orders/${orderId}/status`)
      .set(auth(labToken))
      .send({ status: 'cancelled' })
      .expect(400);
  });

  it('cannot verify a result without an entered value', async () => {
    await collectAll();
    await request(app)
      .patch(`/api/laboratory/results/${resultId}/verify`)
      .set(auth(labToken))
      .expect(400);
  });
});

describe('laboratory RBAC & visibility', () => {
  let orderId: string;

  beforeEach(async () => {
    const blood = await createLabTest();
    const res = await orderTests([blood._id]).expect(201);
    orderId = res.body.data.order._id;
  });

  it('doctor sees own orders but cannot process; nurse sees completed only', async () => {
    // Doctor: own order visible, workflow endpoints forbidden.
    await request(app).get(`/api/laboratory/orders/${orderId}`).set(auth(doctorToken)).expect(200);
    await request(app).get('/api/laboratory/samples').set(auth(doctorToken)).expect(403);
    const detail = await request(app)
      .get(`/api/laboratory/orders/${orderId}`)
      .set(auth(labToken))
      .expect(200);
    await request(app)
      .patch(`/api/laboratory/results/${detail.body.data.results[0]._id}`)
      .set(auth(doctorToken))
      .send({ value: '5' })
      .expect(403);

    // Another doctor cannot see this in-progress order.
    const otherDept = String((await createDepartment('Visibility'))._id);
    const doctorB = await createDoctorViaApi(app, adminToken, otherDept);
    const tokenB = await loginAs(app, { email: doctorB.email, password: 'DoctorPass123!' });
    await request(app).get(`/api/laboratory/orders/${orderId}`).set(auth(tokenB)).expect(403);

    // Nurse: hidden while not completed.
    const nurse = await createStaff('nurse');
    const nurseToken = await loginAs(app, nurse);
    const list = await request(app)
      .get('/api/laboratory/orders')
      .set(auth(nurseToken))
      .expect(200);
    expect(list.body.data.orders).toHaveLength(0);
    await request(app).get(`/api/laboratory/orders/${orderId}`).set(auth(nurseToken)).expect(403);
  });

  it('receptionist and pharmacist have no lab access; unauthenticated is 401', async () => {
    for (const role of ['receptionist', 'pharmacist'] as const) {
      const token = await loginAs(app, await createStaff(role));
      await request(app).get('/api/laboratory/orders').set(auth(token)).expect(403);
      await request(app).get('/api/laboratory/stats').set(auth(token)).expect(403);
    }
    await request(app).get('/api/laboratory/orders').expect(401);
  });
});

describe('GET /api/laboratory/stats', () => {
  it('returns real workflow counts', async () => {
    const blood = await createLabTest();
    await orderTests([blood._id]).expect(201);
    await orderTests([blood._id], { priority: 'urgent' }).expect(201);

    const stats = (
      await request(app).get('/api/laboratory/stats').set(auth(labToken)).expect(200)
    ).body.data;

    expect(stats).toMatchObject({
      pendingOrders: 2,
      samplesAwaitingCollection: 2,
      testsInProcessing: 0,
      completedTests: 0,
      urgentOrders: 1,
      todaysOrders: 2,
    });

    expect(await LabOrder.countDocuments({})).toBe(2);
  });
});
