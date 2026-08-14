import './env.js';
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import createApp from '../app.js';
import Appointment from '../models/Appointment.js';
import { setupTestDB, createAdmin, createStaff, loginAs, ADMIN } from './helpers.js';
import {
  createDepartment,
  createActivePatient,
  createDoctorViaApi,
  setWeekdayAvailability,
  nextMonday,
  type AppointmentJson,
  type DoctorJson,
} from './phase3Helpers.js';

const app = createApp();

setupTestDB();

let adminToken: string;
let departmentId: string;
let doctor: DoctorJson;
let patientId: string;
let monday: string;

beforeEach(async () => {
  await createAdmin();
  adminToken = await loginAs(app, ADMIN);
  departmentId = String((await createDepartment('Cardiology'))._id);
  doctor = await createDoctorViaApi(app, adminToken, departmentId);
  await setWeekdayAvailability(app, adminToken, doctor._id);
  patientId = String((await createActivePatient())._id);
  monday = nextMonday();
});

const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });

const book = (overrides: Record<string, unknown> = {}) =>
  request(app)
    .post('/api/appointments')
    .set(asAdmin())
    .send({
      patientId,
      doctorId: doctor._id,
      appointmentDate: monday,
      startTime: '10:00',
      endTime: '10:30',
      reason: 'Chest pain follow-up',
      ...overrides,
    });

describe('POST /api/appointments', () => {
  it('books an appointment with generated ID and populated relations', async () => {
    const res = await book().expect(201);
    const apt = res.body.data.appointment as AppointmentJson;

    expect(apt.appointmentId).toBe('APT-000001');
    expect(apt.status).toBe('scheduled');
    expect(apt.patientId?.patientId).toMatch(/^PAT-/);
    expect(apt.doctorId?.doctorId).toBe(doctor.doctorId);
    expect(apt.departmentId?.name).toBe('Cardiology');
    expect(apt.createdBy?.role).toBe('admin');
  });

  it('receptionist can book; doctor and nurse cannot', async () => {
    const receptionist = await createStaff('receptionist');
    const rToken = await loginAs(app, receptionist);
    await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${rToken}`)
      .send({
        patientId,
        doctorId: doctor._id,
        appointmentDate: monday,
        startTime: '11:00',
        endTime: '11:30',
        reason: 'Consultation',
      })
      .expect(201);

    const nurse = await createStaff('nurse');
    const nToken = await loginAs(app, nurse);
    await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${nToken}`)
      .send({})
      .expect(403);
  });

  it('rejects invalid shapes with 400', async () => {
    await book({ appointmentDate: 'not-a-date' }).expect(400);
    await book({ startTime: '25:00' }).expect(400);
    await book({ startTime: '11:00', endTime: '10:00' }).expect(400);
    await book({ reason: '' }).expect(400);
    await book({ patientId: 'nope' }).expect(400);
  });

  it('rejects inactive patient, inactive doctor, inactive department', async () => {
    // Inactive patient
    const inactivePatient = await createActivePatient({ status: 'inactive', phone: '555-1' });
    await book({ patientId: String(inactivePatient._id) }).expect(400);

    // Inactive doctor
    await request(app)
      .patch(`/api/doctors/${doctor._id}/status`)
      .set(asAdmin())
      .send({ status: 'inactive' })
      .expect(200);
    await book().expect(400);
    await request(app)
      .patch(`/api/doctors/${doctor._id}/status`)
      .set(asAdmin())
      .send({ status: 'active' })
      .expect(200);

    // Inactive department (deactivate doctor first, then department, then re-activate doctor)
    await request(app)
      .patch(`/api/doctors/${doctor._id}/status`)
      .set(asAdmin())
      .send({ status: 'inactive' });
    await request(app)
      .patch(`/api/departments/${departmentId}/status`)
      .set(asAdmin())
      .send({ status: 'inactive' })
      .expect(200);
    await request(app)
      .patch(`/api/doctors/${doctor._id}/status`)
      .set(asAdmin())
      .send({ status: 'active' });
    await book().expect(400);
  });

  it('rejects times outside the doctor availability', async () => {
    // Weekday availability is 09:00–17:00; Sunday not available at all.
    await book({ startTime: '18:00', endTime: '18:30' }).expect(400);
    await book({ startTime: '08:00', endTime: '09:30' }).expect(400);

    const sunday = new Date(`${monday}T00:00:00.000Z`);
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    await book({ appointmentDate: sunday.toISOString().slice(0, 10) }).expect(400);
  });

  it('prevents overlapping bookings (both directions)', async () => {
    await book({ startTime: '10:00', endTime: '10:30' }).expect(201);

    // starts inside existing
    await book({ startTime: '10:15', endTime: '10:45' }).expect(409);
    // fully contains existing
    await book({ startTime: '09:45', endTime: '11:00' }).expect(409);
    // exact duplicate
    await book({ startTime: '10:00', endTime: '10:30' }).expect(409);
    // touching boundaries is allowed
    await book({ startTime: '10:30', endTime: '11:00' }).expect(201);
    await book({ startTime: '09:30', endTime: '10:00' }).expect(201);
  });

  it('cancelled appointments do not block the slot', async () => {
    const res = await book().expect(201);
    const id = (res.body.data.appointment as AppointmentJson)._id;

    await request(app)
      .patch(`/api/appointments/${id}/status`)
      .set(asAdmin())
      .send({ status: 'cancelled' })
      .expect(200);

    await book().expect(201);
  });

  it('exactly one of two CONCURRENT overlapping bookings survives', async () => {
    const second = await createActivePatient({ phone: '555-2' });

    const results = await Promise.all([
      book().then((r) => r.status),
      book({ patientId: String(second._id), startTime: '10:15', endTime: '10:45' }).then(
        (r) => r.status
      ),
    ]);

    expect(results.filter((s) => s === 201)).toHaveLength(1);
    expect(results.filter((s) => s === 409)).toHaveLength(1);
    expect(await Appointment.countDocuments({})).toBe(1);
  });
});

describe('GET /api/appointments (search, filter, pagination)', () => {
  beforeEach(async () => {
    await book({ startTime: '09:00', endTime: '09:30' }).expect(201);
    await book({ startTime: '10:00', endTime: '10:30' }).expect(201);
    await book({ startTime: '11:00', endTime: '11:30' }).expect(201);
  });

  it('paginates server-side', async () => {
    const page1 = await request(app)
      .get('/api/appointments')
      .query({ page: 1, limit: 2 })
      .set(asAdmin())
      .expect(200);
    expect(page1.body.data.appointments).toHaveLength(2);
    expect(page1.body.data.pagination).toMatchObject({ total: 3, totalPages: 2 });
  });

  it('searches by appointment ID, patient name/ID, and doctor name', async () => {
    for (const term of ['APT-000002', 'john', 'pat-000001', 'house']) {
      const res = await request(app)
        .get('/api/appointments')
        .query({ search: term })
        .set(asAdmin())
        .expect(200);
      expect(res.body.data.appointments.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('filters by status, doctor, and date range', async () => {
    const list = await request(app).get('/api/appointments').set(asAdmin()).expect(200);
    const first = list.body.data.appointments[0] as AppointmentJson;

    await request(app)
      .patch(`/api/appointments/${first._id}/status`)
      .set(asAdmin())
      .send({ status: 'confirmed' })
      .expect(200);

    const confirmed = await request(app)
      .get('/api/appointments')
      .query({ status: 'confirmed' })
      .set(asAdmin())
      .expect(200);
    expect(confirmed.body.data.appointments).toHaveLength(1);

    const byDoctor = await request(app)
      .get('/api/appointments')
      .query({ doctorId: doctor._id })
      .set(asAdmin())
      .expect(200);
    expect(byDoctor.body.data.appointments).toHaveLength(3);

    const byDate = await request(app)
      .get('/api/appointments')
      .query({ dateFrom: monday, dateTo: monday })
      .set(asAdmin())
      .expect(200);
    expect(byDate.body.data.appointments).toHaveLength(3);

    const empty = await request(app)
      .get('/api/appointments')
      .query({ dateFrom: '2099-01-01' })
      .set(asAdmin())
      .expect(200);
    expect(empty.body.data.appointments).toHaveLength(0);
  });

  it('supports patient history via ?patientId=', async () => {
    const res = await request(app)
      .get('/api/appointments')
      .query({ patientId })
      .set(asAdmin())
      .expect(200);
    expect(res.body.data.appointments).toHaveLength(3);
  });
});

describe('doctor scoping', () => {
  it('a doctor sees ONLY their own appointments, in list, detail, and stats', async () => {
    // Doctor A's appointment
    const aptRes = await book().expect(201);
    const aptA = aptRes.body.data.appointment as AppointmentJson;

    // Doctor B with their own appointment
    const doctorB = await createDoctorViaApi(app, adminToken, departmentId);
    await setWeekdayAvailability(app, adminToken, doctorB._id);
    const aptBRes = await book({ doctorId: doctorB._id, startTime: '12:00', endTime: '12:30' }).expect(201);
    const aptB = aptBRes.body.data.appointment as AppointmentJson;

    const tokenB = await loginAs(app, { email: doctorB.email, password: 'DoctorPass123!' });

    // List: only B's own appointment, even when asking for A's via query.
    const list = await request(app)
      .get('/api/appointments')
      .query({ doctorId: doctor._id })
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(list.body.data.appointments).toHaveLength(1);
    expect(list.body.data.appointments[0]._id).toBe(aptB._id);

    // Detail: A's appointment is forbidden.
    await request(app)
      .get(`/api/appointments/${aptA._id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(403);
    await request(app)
      .get(`/api/appointments/${aptB._id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    // Stats are scoped.
    const stats = await request(app)
      .get('/api/appointments/stats')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(stats.body.data.pendingAppointments).toBe(1);
  });

  it("a doctor can update own status but not someone else's", async () => {
    const aptRes = await book().expect(201);
    const apt = aptRes.body.data.appointment as AppointmentJson;

    const doctorB = await createDoctorViaApi(app, adminToken, departmentId);
    const tokenB = await loginAs(app, { email: doctorB.email, password: 'DoctorPass123!' });
    const tokenA = await loginAs(app, { email: doctor.email, password: 'DoctorPass123!' });

    await request(app)
      .patch(`/api/appointments/${apt._id}/status`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ status: 'confirmed' })
      .expect(403);

    await request(app)
      .patch(`/api/appointments/${apt._id}/status`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'confirmed' })
      .expect(200);

    // Doctors cannot cancel.
    await request(app)
      .patch(`/api/appointments/${apt._id}/status`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'cancelled' })
      .expect(403);
  });
});

describe('status transitions', () => {
  const transition = async (id: string, status: string) =>
    request(app).patch(`/api/appointments/${id}/status`).set(asAdmin()).send({ status });

  it('walks the allowed lifecycle and rejects invalid jumps', async () => {
    const res = await book().expect(201);
    const id = (res.body.data.appointment as AppointmentJson)._id;

    // scheduled → completed is NOT allowed
    await transition(id, 'completed').then((r) => expect(r.status).toBe(400));
    // scheduled → confirmed → completed is allowed
    await transition(id, 'confirmed').then((r) => expect(r.status).toBe(200));
    await transition(id, 'completed').then((r) => expect(r.status).toBe(200));
    // completed is terminal
    await transition(id, 'cancelled').then((r) => expect(r.status).toBe(400));
  });

  it('supports confirmed → no_show and cancellation keeps the record', async () => {
    const res = await book().expect(201);
    const id = (res.body.data.appointment as AppointmentJson)._id;

    await transition(id, 'confirmed').then((r) => expect(r.status).toBe(200));
    await transition(id, 'no_show').then((r) => expect(r.status).toBe(200));

    const res2 = await book({ startTime: '13:00', endTime: '13:30' }).expect(201);
    const id2 = (res2.body.data.appointment as AppointmentJson)._id;
    await transition(id2, 'cancelled').then((r) => expect(r.status).toBe(200));

    // Record kept, not deleted.
    expect(await Appointment.countDocuments({})).toBe(2);
  });

  it('rejects unknown statuses with 400', async () => {
    const res = await book().expect(201);
    await transition((res.body.data.appointment as AppointmentJson)._id, 'teleported').then((r) =>
      expect(r.status).toBe(400)
    );
  });
});

describe('PATCH /api/appointments/:id (reschedule)', () => {
  it('reschedules within availability and re-checks conflicts', async () => {
    const a = await book({ startTime: '09:00', endTime: '09:30' }).expect(201);
    await book({ startTime: '10:00', endTime: '10:30' }).expect(201);
    const idA = (a.body.data.appointment as AppointmentJson)._id;

    // Move into the other appointment → conflict.
    await request(app)
      .patch(`/api/appointments/${idA}`)
      .set(asAdmin())
      .send({ startTime: '10:15', endTime: '10:45' })
      .expect(409);

    // Move outside availability → rejected.
    await request(app)
      .patch(`/api/appointments/${idA}`)
      .set(asAdmin())
      .send({ startTime: '18:00', endTime: '18:30' })
      .expect(400);

    // Valid move works and edits notes.
    const ok = await request(app)
      .patch(`/api/appointments/${idA}`)
      .set(asAdmin())
      .send({ startTime: '11:00', endTime: '11:30', notes: 'Rescheduled by phone' })
      .expect(200);
    expect((ok.body.data.appointment as AppointmentJson).startTime).toBe('11:00');
  });

  it('cannot edit a cancelled appointment', async () => {
    const res = await book().expect(201);
    const id = (res.body.data.appointment as AppointmentJson)._id;
    await request(app)
      .patch(`/api/appointments/${id}/status`)
      .set(asAdmin())
      .send({ status: 'cancelled' })
      .expect(200);

    await request(app)
      .patch(`/api/appointments/${id}`)
      .set(asAdmin())
      .send({ notes: 'too late' })
      .expect(400);
  });
});

describe('GET /api/appointments/stats', () => {
  it('returns real counts including doctor totals', async () => {
    await book().expect(201);
    const res = await request(app).get('/api/appointments/stats').set(asAdmin()).expect(200);

    expect(res.body.data.pendingAppointments).toBe(1);
    expect(res.body.data.totalDoctors).toBe(1);
    expect(res.body.data.activeDoctors).toBe(1);
  });

  it('nurse cannot read stats; unauthenticated is 401', async () => {
    const nurse = await createStaff('nurse');
    const token = await loginAs(app, nurse);
    await request(app)
      .get('/api/appointments/stats')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    await request(app).get('/api/appointments/stats').expect(401);
  });

  it('nurse has read-only list access', async () => {
    await book().expect(201);
    const nurse = await createStaff('nurse');
    const token = await loginAs(app, nurse);

    const res = await request(app)
      .get('/api/appointments')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.appointments).toHaveLength(1);

    const id = res.body.data.appointments[0]._id as string;
    await request(app)
      .patch(`/api/appointments/${id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'confirmed' })
      .expect(403);
    await request(app)
      .patch(`/api/appointments/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'nope' })
      .expect(403);
  });
});
