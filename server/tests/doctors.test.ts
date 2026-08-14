import './env.js';
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import createApp from '../app.js';
import User from '../models/User.js';
import { setupTestDB, createAdmin, createStaff, loginAs, ADMIN } from './helpers.js';
import { createDepartment, createDoctorViaApi, type DoctorJson } from './phase3Helpers.js';

const app = createApp();

setupTestDB();

let adminToken: string;
let departmentId: string;

beforeEach(async () => {
  await createAdmin();
  adminToken = await loginAs(app, ADMIN);
  departmentId = String((await createDepartment('Cardiology'))._id);
});

const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });

describe('POST /api/doctors', () => {
  it('creates a doctor with a NEW user account through the existing auth system', async () => {
    const doctor = await createDoctorViaApi(app, adminToken, departmentId);

    expect(doctor.doctorId).toMatch(/^DOC-\d{4}$/);
    expect(doctor.specialization).toBe('Cardiology');
    expect(doctor.status).toBe('active');
    expect(doctor).not.toHaveProperty('password');

    // The linked user exists with role doctor, hashed password, and can log in.
    const user = await User.findById(doctor.userId).select('+password');
    expect(user?.role).toBe('doctor');
    expect(user?.password).not.toBe('DoctorPass123!');

    await request(app)
      .post('/api/auth/login')
      .send({ email: doctor.email, password: 'DoctorPass123!' })
      .expect(200);
  });

  it('links an EXISTING doctor-role user without creating credentials', async () => {
    const creds = await createStaff('doctor');
    const user = await User.findOne({ email: creds.email });

    const res = await request(app)
      .post('/api/doctors')
      .set(asAdmin())
      .send({
        userId: String(user!._id),
        specialization: 'Neurology',
        departmentId,
      })
      .expect(201);

    expect(res.body.data.doctor.userId).toBe(String(user!._id));
    expect(res.body.data.doctor.firstName).toBe(user!.firstName);
  });

  it('rejects linking a non-doctor user', async () => {
    const creds = await createStaff('nurse');
    const user = await User.findOne({ email: creds.email });

    await request(app)
      .post('/api/doctors')
      .set(asAdmin())
      .send({ userId: String(user!._id), specialization: 'X', departmentId })
      .expect(400);
  });

  it('rejects a second profile for the same user with 409', async () => {
    const doctor = await createDoctorViaApi(app, adminToken, departmentId);

    await request(app)
      .post('/api/doctors')
      .set(asAdmin())
      .send({ userId: doctor.userId, specialization: 'Again', departmentId })
      .expect(409);
  });

  it('rejects duplicate license numbers with 409', async () => {
    await createDoctorViaApi(app, adminToken, departmentId, { licenseNumber: 'LIC-SAME' });
    const res = await request(app)
      .post('/api/doctors')
      .set(asAdmin())
      .send({
        user: {
          firstName: 'Second',
          lastName: 'Doc',
          email: 'second.doc@test.local',
          password: 'DoctorPass123!',
        },
        specialization: 'Cardiology',
        departmentId,
        licenseNumber: 'LIC-SAME',
      })
      .expect(409);
    expect(res.body.success).toBe(false);

    // The just-created orphan user account was rolled back.
    expect(await User.findOne({ email: 'second.doc@test.local' })).toBeNull();
  });

  it('rejects an inactive department', async () => {
    const inactive = await createDepartment('Closed Wing', 'inactive');
    await request(app)
      .post('/api/doctors')
      .set(asAdmin())
      .send({
        user: { firstName: 'A', lastName: 'B', email: 'ab@test.local', password: 'Password123!' },
        specialization: 'X',
        departmentId: String(inactive._id),
      })
      .expect(400);
  });

  it('is admin only', async () => {
    const receptionist = await createStaff('receptionist');
    const token = await loginAs(app, receptionist);
    await request(app)
      .post('/api/doctors')
      .set('Authorization', `Bearer ${token}`)
      .send({ specialization: 'X', departmentId })
      .expect(403);
  });
});

describe('GET /api/doctors (search + filter)', () => {
  let doctor: DoctorJson;

  beforeEach(async () => {
    doctor = await createDoctorViaApi(app, adminToken, departmentId);
    await createDoctorViaApi(app, adminToken, departmentId, {
      specialization: 'Dermatology',
      user: {
        firstName: 'Lisa',
        lastName: 'Cuddy',
        email: 'lisa.cuddy@test.local',
        password: 'DoctorPass123!',
      },
    });
  });

  it('lists doctors with pagination and populated department', async () => {
    const res = await request(app).get('/api/doctors').set(asAdmin()).expect(200);
    expect(res.body.data.doctors).toHaveLength(2);
    expect(res.body.data.doctors[0].departmentId.name).toBe('Cardiology');
    expect(res.body.data.pagination.total).toBe(2);
  });

  it('searches by name, doctorId, specialization, and license number', async () => {
    for (const term of ['lisa', doctor.doctorId.toLowerCase(), 'dermat', doctor.licenseNumber!]) {
      const res = await request(app)
        .get('/api/doctors')
        .query({ search: term })
        .set(asAdmin())
        .expect(200);
      expect(res.body.data.doctors.length).toBeGreaterThanOrEqual(1);
    }

    const none = await request(app)
      .get('/api/doctors')
      .query({ search: 'zzz-nobody' })
      .set(asAdmin())
      .expect(200);
    expect(none.body.data.doctors).toHaveLength(0);
  });

  it('filters by department, specialization, and status', async () => {
    const bySpec = await request(app)
      .get('/api/doctors')
      .query({ specialization: 'dermatology' })
      .set(asAdmin())
      .expect(200);
    expect(bySpec.body.data.doctors).toHaveLength(1);

    await request(app)
      .patch(`/api/doctors/${doctor._id}/status`)
      .set(asAdmin())
      .send({ status: 'inactive' })
      .expect(200);

    const inactive = await request(app)
      .get('/api/doctors')
      .query({ status: 'inactive' })
      .set(asAdmin())
      .expect(200);
    expect(inactive.body.data.doctors).toHaveLength(1);
  });

  it('exposes distinct specializations for filters', async () => {
    const res = await request(app).get('/api/doctors/specializations').set(asAdmin()).expect(200);
    expect(res.body.data.specializations).toEqual(['Cardiology', 'Dermatology']);
  });

  it('is viewable by every staff role', async () => {
    for (const role of ['receptionist', 'nurse'] as const) {
      const creds = await createStaff(role);
      const token = await loginAs(app, creds);
      await request(app).get('/api/doctors').set('Authorization', `Bearer ${token}`).expect(200);
    }
  });
});

describe('PATCH /api/doctors/:id', () => {
  it('updates the profile and keeps the linked user in sync', async () => {
    const doctor = await createDoctorViaApi(app, adminToken, departmentId);

    const res = await request(app)
      .patch(`/api/doctors/${doctor._id}`)
      .set(asAdmin())
      .send({ firstName: 'Gregory', consultationFee: 200 })
      .expect(200);

    expect(res.body.data.doctor.firstName).toBe('Gregory');
    expect(res.body.data.doctor.consultationFee).toBe(200);

    const user = await User.findById(doctor.userId);
    expect(user?.firstName).toBe('Gregory');
  });

  it('is admin only', async () => {
    const doctor = await createDoctorViaApi(app, adminToken, departmentId);
    const token = await loginAs(app, { email: doctor.email, password: 'DoctorPass123!' });
    await request(app)
      .patch(`/api/doctors/${doctor._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ consultationFee: 999 })
      .expect(403);
  });
});

describe('availability', () => {
  it('doctor manages own availability; invalid ranges rejected', async () => {
    const doctor = await createDoctorViaApi(app, adminToken, departmentId);
    const token = await loginAs(app, { email: doctor.email, password: 'DoctorPass123!' });

    await request(app)
      .put(`/api/doctors/${doctor._id}/availability`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        availability: [
          { dayOfWeek: 'monday', startTime: '09:00', endTime: '13:00', isAvailable: true },
          { dayOfWeek: 'monday', startTime: '14:00', endTime: '17:00', isAvailable: true },
        ],
      })
      .expect(200);

    const res = await request(app)
      .get(`/api/doctors/${doctor._id}/availability`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.availability).toHaveLength(2);

    // end before start
    await request(app)
      .put(`/api/doctors/${doctor._id}/availability`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        availability: [{ dayOfWeek: 'monday', startTime: '15:00', endTime: '09:00' }],
      })
      .expect(400);

    // bad day / bad time format
    await request(app)
      .put(`/api/doctors/${doctor._id}/availability`)
      .set('Authorization', `Bearer ${token}`)
      .send({ availability: [{ dayOfWeek: 'funday', startTime: '09:00', endTime: '10:00' }] })
      .expect(400);
    await request(app)
      .put(`/api/doctors/${doctor._id}/availability`)
      .set('Authorization', `Bearer ${token}`)
      .send({ availability: [{ dayOfWeek: 'monday', startTime: '9am', endTime: '10:00' }] })
      .expect(400);
  });

  it("a doctor cannot modify another doctor's availability, admin can", async () => {
    const doctorA = await createDoctorViaApi(app, adminToken, departmentId);
    const doctorB = await createDoctorViaApi(app, adminToken, departmentId);
    const tokenA = await loginAs(app, { email: doctorA.email, password: 'DoctorPass123!' });

    const slots = {
      availability: [{ dayOfWeek: 'friday', startTime: '10:00', endTime: '12:00' }],
    };

    await request(app)
      .put(`/api/doctors/${doctorB._id}/availability`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send(slots)
      .expect(403);

    await request(app)
      .put(`/api/doctors/${doctorB._id}/availability`)
      .set(asAdmin())
      .send(slots)
      .expect(200);
  });

  it('GET /api/doctors/me returns the calling doctor profile', async () => {
    const doctor = await createDoctorViaApi(app, adminToken, departmentId);
    const token = await loginAs(app, { email: doctor.email, password: 'DoctorPass123!' });

    const res = await request(app)
      .get('/api/doctors/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.doctor.doctorId).toBe(doctor.doctorId);
  });
});

describe('PATCH /api/doctors/:id/status', () => {
  it('deactivates and reactivates; admin only', async () => {
    const doctor = await createDoctorViaApi(app, adminToken, departmentId);

    const res = await request(app)
      .patch(`/api/doctors/${doctor._id}/status`)
      .set(asAdmin())
      .send({ status: 'inactive' })
      .expect(200);
    expect(res.body.data.doctor.status).toBe('inactive');

    const receptionist = await createStaff('receptionist');
    const token = await loginAs(app, receptionist);
    await request(app)
      .patch(`/api/doctors/${doctor._id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'active' })
      .expect(403);
  });
});
