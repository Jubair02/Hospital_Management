import './env.js';
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import createApp from '../app.js';
import Consultation from '../models/Consultation.js';
import Appointment from '../models/Appointment.js';
import { setupTestDB, createAdmin, createStaff, loginAs, ADMIN } from './helpers.js';
import {
  createDepartment,
  createActivePatient,
  createDoctorViaApi,
  setWeekdayAvailability,
  nextMonday,
  type DoctorJson,
} from './phase3Helpers.js';

interface ConsultationJson {
  _id: string;
  consultationId: string;
  status: string;
  chiefComplaint?: string;
  assessment?: string;
  treatmentPlan?: string;
  vitalSigns: Record<string, number | undefined>;
  diagnoses: Array<{ diagnosis: string; type: string; notes?: string }>;
  prescriptions: Array<{ medicineName: string; dosage: string }>;
  followUpDate?: string;
  patientId: { _id: string; patientId: string; allergies?: string[] } | null;
  doctorId: { _id: string; doctorId: string } | null;
  appointmentId: { _id: string; appointmentId: string; status: string } | null;
}

const app = createApp();

setupTestDB();

let adminToken: string;
let doctor: DoctorJson;
let doctorToken: string;
let patientId: string;
let appointmentMongoId: string;

const bookAppointment = async (overrides: Record<string, unknown> = {}): Promise<string> => {
  const res = await request(app)
    .post('/api/appointments')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      patientId,
      doctorId: doctor._id,
      appointmentDate: nextMonday(),
      startTime: '10:00',
      endTime: '10:30',
      reason: 'Chest pain follow-up',
      ...overrides,
    })
    .expect(201);
  return res.body.data.appointment._id as string;
};

beforeEach(async () => {
  await createAdmin();
  adminToken = await loginAs(app, ADMIN);
  const departmentId = String((await createDepartment('Cardiology'))._id);
  doctor = await createDoctorViaApi(app, adminToken, departmentId);
  await setWeekdayAvailability(app, adminToken, doctor._id);
  doctorToken = await loginAs(app, { email: doctor.email, password: 'DoctorPass123!' });
  patientId = String((await createActivePatient())._id);
  appointmentMongoId = await bookAppointment();
});

const asDoctor = (token = doctorToken) => ({ Authorization: `Bearer ${token}` });

const start = (appointmentId = appointmentMongoId, token = doctorToken) =>
  request(app).post('/api/consultations').set(asDoctor(token)).send({ appointmentId });

const CLINICAL_RECORD = {
  chiefComplaint: 'Persistent headache for three days.',
  historyOfPresentIllness: 'Gradual onset, worse in the morning.',
  physicalExamination: 'Alert, oriented. No focal deficits.',
  assessment: 'Tension-type headache, rule out hypertension.',
  vitalSigns: {
    temperature: 36.8,
    heartRate: 76,
    bloodPressureSystolic: 138,
    bloodPressureDiastolic: 88,
    oxygenSaturation: 98,
    weight: 74,
    height: 178,
  },
  diagnoses: [
    { diagnosis: 'Hypertension', type: 'primary' },
    { diagnosis: 'Tension headache', type: 'secondary', notes: 'Stress-related' },
  ],
  treatmentPlan: 'Lifestyle changes, hydration, monitor blood pressure daily.',
  prescriptions: [
    {
      medicineName: 'Paracetamol',
      dosage: '500 mg',
      frequency: 'Twice daily',
      duration: '5 days',
      route: 'Oral',
      instructions: 'Take after food',
    },
  ],
  followUpDate: nextMonday(),
};

describe('POST /api/consultations (start)', () => {
  it('starts a consultation derived from the appointment and confirms it', async () => {
    const res = await start().expect(201);
    const c = res.body.data.consultation as ConsultationJson;

    expect(c.consultationId).toBe('CON-000001');
    expect(c.status).toBe('in_progress');
    // Relations are copied from the appointment server-side.
    expect(c.patientId?._id).toBe(patientId);
    expect(c.doctorId?._id).toBe(doctor._id);
    // Scheduled appointment became confirmed via the transition table.
    expect(c.appointmentId?.status).toBe('confirmed');
  });

  it('rejects starting on another doctor’s appointment with 403', async () => {
    const departmentId = String((await createDepartment('Neurology'))._id);
    const doctorB = await createDoctorViaApi(app, adminToken, departmentId);
    const tokenB = await loginAs(app, { email: doctorB.email, password: 'DoctorPass123!' });

    await start(appointmentMongoId, tokenB).expect(403);
  });

  it('rejects non-doctor roles with 403 and unauthenticated with 401', async () => {
    for (const role of ['receptionist', 'nurse'] as const) {
      const creds = await createStaff(role);
      const token = await loginAs(app, creds);
      await start(appointmentMongoId, token).expect(403);
    }
    await request(app)
      .post('/api/consultations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ appointmentId: appointmentMongoId })
      .expect(403);
    await request(app)
      .post('/api/consultations')
      .send({ appointmentId: appointmentMongoId })
      .expect(401);
  });

  it('rejects invalid, missing, and unusable appointments', async () => {
    await start('not-an-id').expect(400);
    await start('64b000000000000000000000').expect(404);

    // Cancelled appointment cannot start a consultation.
    const cancelledId = await bookAppointment({ startTime: '11:00', endTime: '11:30' });
    await request(app)
      .patch(`/api/appointments/${cancelledId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'cancelled' })
      .expect(200);
    await start(cancelledId).expect(400);
  });

  it('rejects an inactive patient', async () => {
    const otherAppointment = await bookAppointment({ startTime: '12:00', endTime: '12:30' });
    await request(app)
      .patch(`/api/patients/${patientId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'inactive' })
      .expect(200);

    await start(otherAppointment).expect(400);
  });

  it('prevents a second consultation for the same appointment (sequential + concurrent)', async () => {
    await start().expect(201);
    await start().expect(409);

    // Concurrent duplicate starts on a fresh appointment: exactly one wins.
    const freshId = await bookAppointment({ startTime: '13:00', endTime: '13:30' });
    const results = await Promise.all([
      start(freshId).then((r) => r.status),
      start(freshId).then((r) => r.status),
    ]);
    expect(results.filter((s) => s === 201)).toHaveLength(1);
    expect(await Consultation.countDocuments({ appointmentId: freshId })).toBe(1);
  });

  it('still carries vitalSigns when read back after the create response', async () => {
    // A consultation starts with no vitals recorded. Mongoose minimizes empty
    // objects away on save, so the field survived the create response and then
    // vanished on the next read — the workbench crashed reopening its own
    // record and offered "Start" again, which could only 409.
    const created = await start().expect(201);
    expect(created.body.data.consultation.vitalSigns).toBeDefined();

    const id = created.body.data.consultation._id as string;
    const reread = await request(app).get(`/api/consultations/${id}`).set(asDoctor()).expect(200);
    expect(reread.body.data.consultation.vitalSigns).toBeDefined();

    const listed = await request(app)
      .get(`/api/consultations?appointmentId=${appointmentMongoId}&limit=1`)
      .set(asDoctor())
      .expect(200);
    expect(listed.body.data.consultations[0].vitalSigns).toBeDefined();
  });
});

describe('PATCH /api/consultations/:id (clinical record)', () => {
  let consultationId: string;

  beforeEach(async () => {
    const res = await start().expect(201);
    consultationId = (res.body.data.consultation as ConsultationJson)._id;
  });

  it('saves vitals, notes, diagnoses, treatment, prescriptions, and follow-up', async () => {
    const res = await request(app)
      .patch(`/api/consultations/${consultationId}`)
      .set(asDoctor())
      .send(CLINICAL_RECORD)
      .expect(200);

    const c = res.body.data.consultation as ConsultationJson;
    expect(c.vitalSigns.heartRate).toBe(76);
    expect(c.diagnoses).toHaveLength(2);
    expect(c.diagnoses[0]!.type).toBe('primary');
    expect(c.prescriptions[0]!.medicineName).toBe('Paracetamol');
    expect(c.treatmentPlan).toMatch(/lifestyle/i);
    expect(c.followUpDate).toBeTruthy();
  });

  it('rejects invalid vital signs', async () => {
    await request(app)
      .patch(`/api/consultations/${consultationId}`)
      .set(asDoctor())
      .send({ vitalSigns: { heartRate: -5 } })
      .expect(400);
    await request(app)
      .patch(`/api/consultations/${consultationId}`)
      .set(asDoctor())
      .send({ vitalSigns: { oxygenSaturation: 150 } })
      .expect(400);
    await request(app)
      .patch(`/api/consultations/${consultationId}`)
      .set(asDoctor())
      .send({ vitalSigns: { weight: 'heavy' } })
      .expect(400);
  });

  it('rejects invalid diagnoses and prescriptions', async () => {
    await request(app)
      .patch(`/api/consultations/${consultationId}`)
      .set(asDoctor())
      .send({ diagnoses: [{ diagnosis: 'X', type: 'tertiary' }] })
      .expect(400);
    await request(app)
      .patch(`/api/consultations/${consultationId}`)
      .set(asDoctor())
      .send({ diagnoses: [{ type: 'primary' }] })
      .expect(400);
    await request(app)
      .patch(`/api/consultations/${consultationId}`)
      .set(asDoctor())
      .send({ prescriptions: [{ medicineName: 'Paracetamol' }] })
      .expect(400);
  });

  it('rejects a past follow-up date', async () => {
    await request(app)
      .patch(`/api/consultations/${consultationId}`)
      .set(asDoctor())
      .send({ followUpDate: '2020-01-01' })
      .expect(400);
  });

  it('only the assigned doctor may edit — not another doctor, nurse, or admin', async () => {
    const departmentId = String((await createDepartment('Neurology'))._id);
    const doctorB = await createDoctorViaApi(app, adminToken, departmentId);
    const tokenB = await loginAs(app, { email: doctorB.email, password: 'DoctorPass123!' });

    await request(app)
      .patch(`/api/consultations/${consultationId}`)
      .set(asDoctor(tokenB))
      .send({ assessment: 'Hijacked' })
      .expect(403);

    const nurse = await createStaff('nurse');
    const nurseToken = await loginAs(app, nurse);
    await request(app)
      .patch(`/api/consultations/${consultationId}`)
      .set({ Authorization: `Bearer ${nurseToken}` })
      .send({ assessment: 'Nope' })
      .expect(403);

    // Admin has read access but is not a clinical author.
    await request(app)
      .patch(`/api/consultations/${consultationId}`)
      .set({ Authorization: `Bearer ${adminToken}` })
      .send({ assessment: 'Admin override' })
      .expect(403);
  });
});

describe('completing a consultation', () => {
  let consultationId: string;

  beforeEach(async () => {
    const res = await start().expect(201);
    consultationId = (res.body.data.consultation as ConsultationJson)._id;
  });

  const setStatus = (status: string, token = doctorToken) =>
    request(app)
      .patch(`/api/consultations/${consultationId}/status`)
      .set(asDoctor(token))
      .send({ status });

  it('refuses completion until the minimum clinical record exists', async () => {
    const res = await setStatus('completed').expect(400);
    expect(res.body.message).toMatch(/chief complaint/i);
    expect(res.body.message).toMatch(/diagnosis/i);
  });

  it('completes with a full record, locks it, and completes the appointment', async () => {
    await request(app)
      .patch(`/api/consultations/${consultationId}`)
      .set(asDoctor())
      .send(CLINICAL_RECORD)
      .expect(200);

    const res = await setStatus('completed').expect(200);
    expect((res.body.data.consultation as ConsultationJson).status).toBe('completed');

    // Linked appointment moved through the existing transition table.
    const appointment = await Appointment.findById(appointmentMongoId);
    expect(appointment?.status).toBe('completed');

    // Read-only: edits and further transitions are refused.
    await request(app)
      .patch(`/api/consultations/${consultationId}`)
      .set(asDoctor())
      .send({ assessment: 'Silent edit' })
      .expect(400);
    await setStatus('cancelled').expect(400);
    await setStatus('in_progress').expect(400);
  });

  it('can cancel an in-progress consultation', async () => {
    const res = await setStatus('cancelled').expect(200);
    expect((res.body.data.consultation as ConsultationJson).status).toBe('cancelled');
  });

  it('rejects an unknown status with 400', async () => {
    await setStatus('archived').expect(400);
  });

  it('leaves the record untouched when the appointment cannot be completed', async () => {
    // The consultation used to be saved as completed — and so locked — before
    // the appointment transition was attempted, so this returned an error on
    // work that had already been committed.
    await request(app)
      .patch(`/api/consultations/${consultationId}`)
      .set(asDoctor())
      .send(CLINICAL_RECORD)
      .expect(200);

    // Reach past the API guard to recreate the race it now prevents.
    await Appointment.findByIdAndUpdate(appointmentMongoId, { status: 'cancelled' });

    const res = await setStatus('completed').expect(409);
    expect(res.body.message).toMatch(/nothing was saved/i);

    const stored = await Consultation.findById(consultationId);
    expect(stored?.status).toBe('in_progress');
  });
});

describe('appointment and consultation interlock', () => {
  let consultationId: string;

  beforeEach(async () => {
    const res = await start().expect(201);
    consultationId = (res.body.data.consultation as ConsultationJson)._id;
  });

  const setAppointmentStatus = (status: string) =>
    request(app)
      .patch(`/api/appointments/${appointmentMongoId}/status`)
      .set({ Authorization: `Bearer ${adminToken}` })
      .send({ status });

  it('refuses to cancel or no-show an appointment while its consultation is open', async () => {
    for (const status of ['cancelled', 'no_show']) {
      const res = await setAppointmentStatus(status).expect(409);
      expect(res.body.message).toMatch(/CON-\d+ is open/);
    }
    expect((await Appointment.findById(appointmentMongoId))?.status).toBe('confirmed');

    // Closing the record releases the appointment again.
    await request(app)
      .patch(`/api/consultations/${consultationId}/status`)
      .set(asDoctor())
      .send({ status: 'cancelled' })
      .expect(200);
    await setAppointmentStatus('no_show').expect(200);
  });

  it('refuses to reschedule while a consultation is open, but still allows notes', async () => {
    await request(app)
      .patch(`/api/appointments/${appointmentMongoId}`)
      .set({ Authorization: `Bearer ${adminToken}` })
      .send({ startTime: '14:00', endTime: '14:30' })
      .expect(409);

    await request(app)
      .patch(`/api/appointments/${appointmentMongoId}`)
      .set({ Authorization: `Bearer ${adminToken}` })
      .send({ notes: 'Patient arrived late.' })
      .expect(200);
  });

  it('a cancelled consultation releases its appointment for a fresh start', async () => {
    await request(app)
      .patch(`/api/consultations/${consultationId}/status`)
      .set(asDoctor())
      .send({ status: 'cancelled' })
      .expect(200);

    // Previously a plain unique index made this 409 forever: the appointment
    // could never be consulted again and never be closed.
    const restarted = await start().expect(201);
    expect(restarted.body.data.consultation._id).not.toBe(consultationId);
    expect(await Consultation.countDocuments({ appointmentId: appointmentMongoId })).toBe(2);

    // The live record is still unique — a second start is refused.
    await start().expect(409);
  });
});

describe('visibility and history', () => {
  let ownId: string;

  beforeEach(async () => {
    const res = await start().expect(201);
    ownId = (res.body.data.consultation as ConsultationJson)._id;
  });

  const completeOwn = async () => {
    await request(app)
      .patch(`/api/consultations/${ownId}`)
      .set(asDoctor())
      .send(CLINICAL_RECORD)
      .expect(200);
    await request(app)
      .patch(`/api/consultations/${ownId}/status`)
      .set(asDoctor())
      .send({ status: 'completed' })
      .expect(200);
  };

  it('admin reads everything; receptionist is fully blocked', async () => {
    await request(app)
      .get('/api/consultations')
      .set({ Authorization: `Bearer ${adminToken}` })
      .expect(200);
    await request(app)
      .get(`/api/consultations/${ownId}`)
      .set({ Authorization: `Bearer ${adminToken}` })
      .expect(200);

    const receptionist = await createStaff('receptionist');
    const token = await loginAs(app, receptionist);
    await request(app)
      .get('/api/consultations')
      .set({ Authorization: `Bearer ${token}` })
      .expect(403);
    await request(app)
      .get(`/api/consultations/${ownId}`)
      .set({ Authorization: `Bearer ${token}` })
      .expect(403);
    await request(app)
      .get(`/api/patients/${patientId}/consultations`)
      .set({ Authorization: `Bearer ${token}` })
      .expect(403);
  });

  it('nurse sees only completed consultations', async () => {
    const nurse = await createStaff('nurse');
    const token = await loginAs(app, nurse);

    // In progress: hidden from list, 403 on detail.
    const before = await request(app)
      .get('/api/consultations')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);
    expect(before.body.data.consultations).toHaveLength(0);
    await request(app)
      .get(`/api/consultations/${ownId}`)
      .set({ Authorization: `Bearer ${token}` })
      .expect(403);

    await completeOwn();

    const after = await request(app)
      .get('/api/consultations')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);
    expect(after.body.data.consultations).toHaveLength(1);
    await request(app)
      .get(`/api/consultations/${ownId}`)
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);
  });

  it("a doctor sees their own work plus other doctors' completed records only", async () => {
    const departmentId = String((await createDepartment('Neurology'))._id);
    const doctorB = await createDoctorViaApi(app, adminToken, departmentId);
    const tokenB = await loginAs(app, { email: doctorB.email, password: 'DoctorPass123!' });

    // B cannot see A's in-progress record.
    const listB = await request(app)
      .get('/api/consultations')
      .set(asDoctor(tokenB))
      .expect(200);
    expect(listB.body.data.consultations).toHaveLength(0);
    await request(app).get(`/api/consultations/${ownId}`).set(asDoctor(tokenB)).expect(403);

    // Once completed it becomes clinical history B can review.
    await completeOwn();
    await request(app).get(`/api/consultations/${ownId}`).set(asDoctor(tokenB)).expect(200);
  });

  it('patient history endpoint paginates and filters', async () => {
    await completeOwn();

    const res = await request(app)
      .get(`/api/patients/${patientId}/consultations`)
      .query({ page: 1, limit: 5, status: 'completed' })
      .set(asDoctor())
      .expect(200);

    expect(res.body.data.consultations).toHaveLength(1);
    expect(res.body.data.pagination.total).toBe(1);

    const none = await request(app)
      .get(`/api/patients/${patientId}/consultations`)
      .query({ dateFrom: '2099-01-01' })
      .set(asDoctor())
      .expect(200);
    expect(none.body.data.consultations).toHaveLength(0);
  });

  it('doctor consultations endpoint enforces ownership', async () => {
    await request(app)
      .get(`/api/doctors/${doctor._id}/consultations`)
      .set(asDoctor())
      .expect(200);

    const departmentId = String((await createDepartment('Neurology'))._id);
    const doctorB = await createDoctorViaApi(app, adminToken, departmentId);
    const tokenB = await loginAs(app, { email: doctorB.email, password: 'DoctorPass123!' });

    await request(app)
      .get(`/api/doctors/${doctor._id}/consultations`)
      .set(asDoctor(tokenB))
      .expect(403);

    await request(app)
      .get(`/api/doctors/${doctor._id}/consultations`)
      .set({ Authorization: `Bearer ${adminToken}` })
      .expect(200);
  });
});

describe('GET /api/consultations/stats', () => {
  it('returns real counts, doctor-scoped for doctors', async () => {
    const res = await start().expect(201);
    const id = (res.body.data.consultation as ConsultationJson)._id;
    await request(app)
      .patch(`/api/consultations/${id}`)
      .set(asDoctor())
      .send(CLINICAL_RECORD)
      .expect(200);
    await request(app)
      .patch(`/api/consultations/${id}/status`)
      .set(asDoctor())
      .send({ status: 'completed' })
      .expect(200);

    const doctorStats = await request(app)
      .get('/api/consultations/stats')
      .set(asDoctor())
      .expect(200);
    expect(doctorStats.body.data).toMatchObject({
      totalConsultations: 1,
      completedConsultations: 1,
      inProgressConsultations: 0,
      todaysConsultations: 1,
      completedToday: 1,
    });

    const adminStats = await request(app)
      .get('/api/consultations/stats')
      .set({ Authorization: `Bearer ${adminToken}` })
      .expect(200);
    expect(adminStats.body.data.totalConsultations).toBe(1);

    const nurse = await createStaff('nurse');
    const token = await loginAs(app, nurse);
    await request(app)
      .get('/api/consultations/stats')
      .set({ Authorization: `Bearer ${token}` })
      .expect(403);
  });
});
