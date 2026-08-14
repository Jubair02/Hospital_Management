import './env.js';
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import createApp from '../app.js';
import Bed from '../models/Bed.js';
import Admission from '../models/Admission.js';
import { setupTestDB, createAdmin, createStaff, loginAs, ADMIN } from './helpers.js';
import { createDepartment, createActivePatient, createDoctorViaApi } from './phase3Helpers.js';

const app = createApp();

setupTestDB();

let adminToken: string;
let receptionistToken: string;
let doctorMongoId: string;
let patientId: string;
let wardId: string;
let bedA: string;
let bedB: string;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const createWard = async (
  name = 'General Ward A',
  overrides: Record<string, unknown> = {}
): Promise<string> => {
  const res = await request(app)
    .post('/api/inpatient/wards')
    .set(auth(adminToken))
    .send({ name, type: 'general', floor: '2', ...overrides })
    .expect(201);
  return res.body.data.ward._id as string;
};

const createBed = async (
  ward: string,
  bedNumber: string,
  overrides: Record<string, unknown> = {}
): Promise<string> => {
  const res = await request(app)
    .post('/api/inpatient/beds')
    .set(auth(adminToken))
    .send({ wardId: ward, bedNumber, bedType: 'standard', ...overrides })
    .expect(201);
  return res.body.data.bed._id as string;
};

const admit = (overrides: Record<string, unknown> = {}, token = receptionistToken) =>
  request(app)
    .post('/api/inpatient/admissions')
    .set(auth(token))
    .send({
      patientId,
      doctorId: doctorMongoId,
      wardId,
      bedId: bedA,
      reason: 'Observation after fall',
      admissionType: 'emergency',
      ...overrides,
    });

beforeEach(async () => {
  await createAdmin();
  adminToken = await loginAs(app, ADMIN);
  receptionistToken = await loginAs(app, await createStaff('receptionist'));
  const departmentId = String((await createDepartment(`D-${Math.random().toString(36).slice(2, 8)}`))._id);
  doctorMongoId = (await createDoctorViaApi(app, adminToken, departmentId))._id;
  patientId = String((await createActivePatient())._id);
  wardId = await createWard();
  bedA = await createBed(wardId, 'A-101');
  bedB = await createBed(wardId, 'A-102');
});

describe('wards & beds', () => {
  it('creates wards with generated IDs, filters, and shows bed summaries', async () => {
    const list = await request(app)
      .get('/api/inpatient/wards')
      .set(auth(receptionistToken))
      .expect(200);
    expect(list.body.data.wards).toHaveLength(1);
    expect(list.body.data.wards[0].wardId).toBe('WRD-001');
    expect(list.body.data.wards[0].bedSummary).toMatchObject({ total: 2, available: 2 });

    await createWard('ICU', { type: 'icu' });
    const byType = await request(app)
      .get('/api/inpatient/wards')
      .query({ type: 'icu' })
      .set(auth(adminToken))
      .expect(200);
    expect(byType.body.data.wards).toHaveLength(1);

    // Duplicate ward name → 409.
    await request(app)
      .post('/api/inpatient/wards')
      .set(auth(adminToken))
      .send({ name: 'General Ward A', type: 'general' })
      .expect(409);
  });

  it('bed numbers are unique within a ward; bed status is guarded', async () => {
    await request(app)
      .post('/api/inpatient/beds')
      .set(auth(adminToken))
      .send({ wardId, bedNumber: 'A-101' })
      .expect(409);

    // Manual "occupied" is impossible.
    await request(app)
      .patch(`/api/inpatient/beds/${bedA}/status`)
      .set(auth(adminToken))
      .send({ status: 'occupied' })
      .expect(400);

    // Maintenance works.
    await request(app)
      .patch(`/api/inpatient/beds/${bedA}/status`)
      .set(auth(adminToken))
      .send({ status: 'maintenance' })
      .expect(200);

    const byStatus = await request(app)
      .get('/api/inpatient/beds')
      .query({ status: 'maintenance' })
      .set(auth(receptionistToken))
      .expect(200);
    expect(byStatus.body.data.beds).toHaveLength(1);
  });

  it('ward and bed management is admin-only', async () => {
    await request(app)
      .post('/api/inpatient/wards')
      .set(auth(receptionistToken))
      .send({ name: 'X', type: 'general' })
      .expect(403);
    await request(app)
      .post('/api/inpatient/beds')
      .set(auth(receptionistToken))
      .send({ wardId, bedNumber: 'Z-1' })
      .expect(403);
  });
});

describe('admission', () => {
  it('admits a patient: record created, bed occupied and linked', async () => {
    const res = await admit().expect(201);
    const admission = res.body.data.admission;

    expect(admission.admissionId).toBe('ADM-000001');
    expect(admission.status).toBe('admitted');
    expect(admission.patientId._id).toBe(patientId);
    expect(admission.bedId.bedNumber).toBe('A-101');

    const bed = await Bed.findById(bedA);
    expect(bed?.status).toBe('occupied');
    expect(String(bed?.currentPatientId)).toBe(patientId);
  });

  it('rejects unusable beds: occupied, maintenance, inactive, wrong ward, inactive ward', async () => {
    await admit().expect(201); // bedA now occupied
    const otherPatient = String((await createActivePatient({ phone: '555-1' }))._id);

    await admit({ patientId: otherPatient, bedId: bedA }).expect(400); // occupied

    await request(app)
      .patch(`/api/inpatient/beds/${bedB}/status`)
      .set(auth(adminToken))
      .send({ status: 'maintenance' })
      .expect(200);
    await admit({ patientId: otherPatient, bedId: bedB }).expect(400); // maintenance

    await request(app)
      .patch(`/api/inpatient/beds/${bedB}/status`)
      .set(auth(adminToken))
      .send({ status: 'inactive' })
      .expect(200);
    await admit({ patientId: otherPatient, bedId: bedB }).expect(400); // inactive

    // Bed from another ward.
    const ward2 = await createWard('Ward B');
    const foreignBed = await createBed(ward2, 'B-1');
    await admit({ patientId: otherPatient, wardId, bedId: foreignBed }).expect(400);

    // Inactive ward.
    await request(app)
      .patch(`/api/inpatient/wards/${ward2}/status`)
      .set(auth(adminToken))
      .send({ status: 'inactive' })
      .expect(200);
    await admit({ patientId: otherPatient, wardId: ward2, bedId: foreignBed }).expect(400);
  });

  it('rejects inactive patients and missing records', async () => {
    await admit({ patientId: '64b000000000000000000000' }).expect(404);
    await admit({ doctorId: '64b000000000000000000000' }).expect(404);
    await admit({ admissionType: 'walk_in' }).expect(400);

    await request(app)
      .patch(`/api/patients/${patientId}/status`)
      .set(auth(adminToken))
      .send({ status: 'inactive' })
      .expect(200);
    await admit().expect(400);
  });

  it('one patient cannot hold two active admissions (sequential + concurrent)', async () => {
    await admit().expect(201);
    await admit({ bedId: bedB }).expect(409);

    // Concurrent double admission of a fresh patient to two different
    // beds: the partial unique index lets exactly one through, and the
    // loser's bed claim is rolled back.
    const fresh = String((await createActivePatient({ phone: '555-2' }))._id);
    const bedC = await createBed(wardId, 'A-103');
    const bedD = await createBed(wardId, 'A-104');

    const [a, b] = await Promise.all([
      admit({ patientId: fresh, bedId: bedC }).then((r) => r.status),
      admit({ patientId: fresh, bedId: bedD }).then((r) => r.status),
    ]);

    expect([a, b].filter((s) => s === 201)).toHaveLength(1);
    expect(await Admission.countDocuments({ patientId: fresh, isActive: true })).toBe(1);

    // Exactly one of the two beds is occupied; the other was released.
    const beds = await Bed.find({ _id: { $in: [bedC, bedD] } });
    expect(beds.filter((bd) => bd.status === 'occupied')).toHaveLength(1);
    expect(beds.filter((bd) => bd.status === 'available')).toHaveLength(1);
  });

  it('concurrent claims on the SAME bed admit exactly one patient', async () => {
    const p1 = String((await createActivePatient({ phone: '555-3' }))._id);
    const p2 = String((await createActivePatient({ phone: '555-4' }))._id);

    const [a, b] = await Promise.all([
      admit({ patientId: p1, bedId: bedB }).then((r) => r.status),
      admit({ patientId: p2, bedId: bedB }).then((r) => r.status),
    ]);

    expect([a, b].filter((s) => s === 201)).toHaveLength(1);

    const bed = await Bed.findById(bedB);
    expect(bed?.status).toBe('occupied');
    // The bed holds exactly one of the two patients — never both.
    expect([p1, p2]).toContain(String(bed?.currentPatientId));
    expect(await Admission.countDocuments({ bedId: bedB, isActive: true })).toBe(1);
  });
});

describe('transfer', () => {
  let admissionId: string;

  beforeEach(async () => {
    const res = await admit().expect(201);
    admissionId = res.body.data.admission._id;
  });

  it('moves the patient: old bed released, new bed occupied, history recorded', async () => {
    const res = await request(app)
      .post('/api/inpatient/transfers')
      .set(auth(receptionistToken))
      .send({ admissionId, toWardId: wardId, toBedId: bedB, reason: 'Closer to nursing station' })
      .expect(201);

    expect(res.body.data.transfer.transferId).toBe('TRF-000001');

    const [oldBed, newBed, admission] = await Promise.all([
      Bed.findById(bedA),
      Bed.findById(bedB),
      Admission.findById(admissionId),
    ]);
    expect(oldBed?.status).toBe('available');
    expect(oldBed?.currentPatientId).toBeNull();
    expect(newBed?.status).toBe('occupied');
    expect(String(newBed?.currentPatientId)).toBe(patientId);
    expect(admission?.status).toBe('transferred');
    expect(String(admission?.bedId)).toBe(bedB);

    const detail = await request(app)
      .get(`/api/inpatient/admissions/${admissionId}`)
      .set(auth(receptionistToken))
      .expect(200);
    expect(detail.body.data.transfers).toHaveLength(1);
  });

  it('fails cleanly to an unavailable bed — no partial state', async () => {
    // Occupy bedB with someone else first.
    const other = String((await createActivePatient({ phone: '555-5' }))._id);
    await admit({ patientId: other, bedId: bedB }).expect(201);

    await request(app)
      .post('/api/inpatient/transfers')
      .set(auth(receptionistToken))
      .send({ admissionId, toWardId: wardId, toBedId: bedB })
      .expect(400);

    // Nothing moved.
    const [oldBed, admission] = await Promise.all([
      Bed.findById(bedA),
      Admission.findById(admissionId),
    ]);
    expect(oldBed?.status).toBe('occupied');
    expect(String(admission?.bedId)).toBe(bedA);
  });

  it('discharged admissions cannot be transferred', async () => {
    await request(app)
      .post('/api/inpatient/discharges')
      .set(auth(receptionistToken))
      .send({ admissionId })
      .expect(200);

    await request(app)
      .post('/api/inpatient/transfers')
      .set(auth(receptionistToken))
      .send({ admissionId, toWardId: wardId, toBedId: bedB })
      .expect(400);
  });
});

describe('discharge', () => {
  let admissionId: string;

  beforeEach(async () => {
    const res = await admit().expect(201);
    admissionId = res.body.data.admission._id;
  });

  it('discharges: bed released, record kept, second discharge rejected', async () => {
    const res = await request(app)
      .post('/api/inpatient/discharges')
      .set(auth(receptionistToken))
      .send({ admissionId, notes: 'Recovered well' })
      .expect(200);

    expect(res.body.data.admission.status).toBe('discharged');
    expect(res.body.data.admission.dischargeDate).toBeTruthy();

    const bed = await Bed.findById(bedA);
    expect(bed?.status).toBe('available');
    expect(bed?.currentPatientId).toBeNull();

    expect(await Admission.countDocuments({})).toBe(1); // record kept

    await request(app)
      .post('/api/inpatient/discharges')
      .set(auth(receptionistToken))
      .send({ admissionId })
      .expect(400);

    // The patient can be admitted again afterwards.
    await admit({ bedId: bedB }).expect(201);
  });

  it('admin can cancel an admission; receptionist cannot', async () => {
    await request(app)
      .post('/api/inpatient/discharges')
      .set(auth(receptionistToken))
      .send({ admissionId, outcome: 'cancelled' })
      .expect(403);

    const res = await request(app)
      .post('/api/inpatient/discharges')
      .set(auth(adminToken))
      .send({ admissionId, outcome: 'cancelled' })
      .expect(200);
    expect(res.body.data.admission.status).toBe('cancelled');

    const bed = await Bed.findById(bedA);
    expect(bed?.status).toBe('available');
  });
});

describe('visibility, filters & RBAC', () => {
  it('doctor sees only their own admissions; nurse read-only; pharmacist/lab blocked', async () => {
    await admit().expect(201);

    // Another doctor sees nothing.
    const otherDept = String((await createDepartment('Other'))._id);
    const doctorB = await createDoctorViaApi(app, adminToken, otherDept);
    const tokenB = await loginAs(app, { email: doctorB.email, password: 'DoctorPass123!' });
    const listB = await request(app)
      .get('/api/inpatient/admissions')
      .set(auth(tokenB))
      .expect(200);
    expect(listB.body.data.admissions).toHaveLength(0);

    // Nurse: read yes, write no.
    const nurseToken = await loginAs(app, await createStaff('nurse'));
    const nurseList = await request(app)
      .get('/api/inpatient/admissions')
      .set(auth(nurseToken))
      .expect(200);
    expect(nurseList.body.data.admissions).toHaveLength(1);
    await admit({}, nurseToken).expect(403);
    await request(app)
      .post('/api/inpatient/discharges')
      .set(auth(nurseToken))
      .send({ admissionId: nurseList.body.data.admissions[0]._id })
      .expect(403);

    for (const role of ['pharmacist', 'lab_technician'] as const) {
      const token = await loginAs(app, await createStaff(role));
      await request(app).get('/api/inpatient/admissions').set(auth(token)).expect(403);
    }
    await request(app).get('/api/inpatient/admissions').expect(401);
  });

  it('filters admissions by status, ward, patient, and paginates', async () => {
    await admit().expect(201);
    const other = String((await createActivePatient({ phone: '555-6' }))._id);
    await admit({ patientId: other, bedId: bedB }).expect(201);

    const byPatient = await request(app)
      .get('/api/inpatient/admissions')
      .query({ patientId })
      .set(auth(receptionistToken))
      .expect(200);
    expect(byPatient.body.data.admissions).toHaveLength(1);

    const paged = await request(app)
      .get('/api/inpatient/admissions')
      .query({ page: 2, limit: 1 })
      .set(auth(receptionistToken))
      .expect(200);
    expect(paged.body.data.admissions).toHaveLength(1);
    expect(paged.body.data.pagination.totalPages).toBe(2);

    const none = await request(app)
      .get('/api/inpatient/admissions')
      .query({ dateFrom: '2099-01-01' })
      .set(auth(receptionistToken))
      .expect(200);
    expect(none.body.data.admissions).toHaveLength(0);
  });
});

describe('GET /api/inpatient/stats', () => {
  it('returns real ward/bed/admission counts', async () => {
    await admit().expect(201);

    const stats = (
      await request(app).get('/api/inpatient/stats').set(auth(receptionistToken)).expect(200)
    ).body.data;

    expect(stats).toMatchObject({
      totalWards: 1,
      totalBeds: 2,
      availableBeds: 1,
      occupiedBeds: 1,
      reservedBeds: 0,
      maintenanceBeds: 0,
      currentInpatients: 1,
      todaysAdmissions: 1,
      todaysDischarges: 0,
    });
  });
});
