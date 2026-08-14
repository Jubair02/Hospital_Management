import './env.js';
import { describe, it, expect, beforeEach } from 'vitest';
import request, { type Test as SupertestTest } from 'supertest';
import createApp from '../app.js';
import type { UserDocument } from '../models/User.js';
import { setupTestDB, createAdmin, loginAs, ADMIN, DOCTOR } from './helpers.js';
import { createDepartment, createDoctorViaApi as createDoctorProfile } from './phase3Helpers.js';

interface UserJson {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: string;
  isActive: boolean;
}

const app = createApp();

setupTestDB();

let admin: UserDocument;
let adminToken: string;

beforeEach(async () => {
  admin = await createAdmin();
  adminToken = await loginAs(app, ADMIN);
});

const asAdmin = (req: SupertestTest): SupertestTest =>
  req.set('Authorization', `Bearer ${adminToken}`);

const createDoctorViaApi = async (): Promise<UserJson> => {
  const res = await asAdmin(request(app).post('/api/users')).send(DOCTOR).expect(201);
  return res.body.data.user as UserJson;
};

describe('POST /api/users (admin)', () => {
  it('creates a user and normalizes the email', async () => {
    const res = await asAdmin(request(app).post('/api/users'))
      .send({ ...DOCTOR, email: 'JANE.MILLER@TEST.LOCAL' })
      .expect(201);

    const user = res.body.data.user as UserJson;
    expect(user.email).toBe(DOCTOR.email);
    expect(user.role).toBe('doctor');
    expect(user.isActive).toBe(true);
    expect(user).not.toHaveProperty('password');
  });

  it('rejects a duplicate email with 409', async () => {
    await createDoctorViaApi();

    const res = await asAdmin(request(app).post('/api/users'))
      .send({ ...DOCTOR, firstName: 'Dup' })
      .expect(409);

    expect(res.body.success).toBe(false);
  });

  it('rejects an invalid role with 400', async () => {
    await asAdmin(request(app).post('/api/users'))
      .send({ ...DOCTOR, email: 'other@test.local', role: 'hacker' })
      .expect(400);
  });

  it('rejects a short password with 400', async () => {
    await asAdmin(request(app).post('/api/users'))
      .send({ ...DOCTOR, email: 'other@test.local', password: 'abc' })
      .expect(400);
  });

  it('rejects missing required fields with 400', async () => {
    await asAdmin(request(app).post('/api/users')).send({ email: 'x@y.z' }).expect(400);
  });
});

describe('GET /api/users (admin)', () => {
  it('lists users with pagination and never exposes passwords', async () => {
    await createDoctorViaApi();

    const res = await asAdmin(request(app).get('/api/users')).expect(200);

    expect(res.body.data.users).toHaveLength(2);
    expect(res.body.data.pagination.total).toBe(2);
    for (const u of res.body.data.users as UserJson[]) {
      expect(u).not.toHaveProperty('password');
    }
  });

  it('filters by search term and role', async () => {
    await createDoctorViaApi();

    const res = await asAdmin(
      request(app).get('/api/users').query({ search: 'jane', role: 'doctor' })
    ).expect(200);

    expect(res.body.data.users).toHaveLength(1);
    expect((res.body.data.users as UserJson[])[0]!.email).toBe(DOCTOR.email);
  });

  it('filters by status', async () => {
    const doctor = await createDoctorViaApi();
    await asAdmin(request(app).patch(`/api/users/${doctor._id}/status`))
      .send({ isActive: false })
      .expect(200);

    const res = await asAdmin(
      request(app).get('/api/users').query({ status: 'inactive' })
    ).expect(200);

    expect(res.body.data.users).toHaveLength(1);
    expect((res.body.data.users as UserJson[])[0]!.isActive).toBe(false);
  });
});

describe('GET/PATCH /api/users/:id (admin)', () => {
  it('returns 400 for a malformed id', async () => {
    await asAdmin(request(app).get('/api/users/not-an-id')).expect(400);
  });

  it('returns 404 for a missing id', async () => {
    await asAdmin(request(app).get('/api/users/64b000000000000000000000')).expect(404);
  });

  it('fetches a single user', async () => {
    const doctor = await createDoctorViaApi();
    const res = await asAdmin(request(app).get(`/api/users/${doctor._id}`)).expect(200);
    expect((res.body.data.user as UserJson).email).toBe(DOCTOR.email);
  });

  it('updates profile fields', async () => {
    const doctor = await createDoctorViaApi();

    const res = await asAdmin(request(app).patch(`/api/users/${doctor._id}`))
      .send({ phone: '555-0199', firstName: 'Janet' })
      .expect(200);

    const user = res.body.data.user as UserJson;
    expect(user.phone).toBe('555-0199');
    expect(user.firstName).toBe('Janet');
  });

  it('changes a password and the new one works at login', async () => {
    const doctor = await createDoctorViaApi();

    await asAdmin(request(app).patch(`/api/users/${doctor._id}`))
      .send({ password: 'NewDoctorPass1!' })
      .expect(200);

    await request(app)
      .post('/api/auth/login')
      .send({ email: DOCTOR.email, password: 'NewDoctorPass1!' })
      .expect(200);

    await request(app)
      .post('/api/auth/login')
      .send({ email: DOCTOR.email, password: DOCTOR.password })
      .expect(401);
  });

  it('blocks an admin from changing their own role', async () => {
    await asAdmin(request(app).patch(`/api/users/${admin._id}`))
      .send({ role: 'nurse' })
      .expect(400);
  });
});

describe('PATCH /api/users/:id/status (admin)', () => {
  it('requires a boolean isActive', async () => {
    const doctor = await createDoctorViaApi();
    await asAdmin(request(app).patch(`/api/users/${doctor._id}/status`))
      .send({ isActive: 'nope' })
      .expect(400);
  });

  it('deactivation kills existing tokens and blocks new logins; reactivation restores access', async () => {
    const doctor = await createDoctorViaApi();
    const doctorToken = await loginAs(app, DOCTOR);

    await asAdmin(request(app).patch(`/api/users/${doctor._id}/status`))
      .send({ isActive: false })
      .expect(200);

    // Existing token no longer works
    await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(403);

    // New login is blocked
    await request(app)
      .post('/api/auth/login')
      .send({ email: DOCTOR.email, password: DOCTOR.password })
      .expect(403);

    // Reactivate
    await asAdmin(request(app).patch(`/api/users/${doctor._id}/status`))
      .send({ isActive: true })
      .expect(200);

    await request(app)
      .post('/api/auth/login')
      .send({ email: DOCTOR.email, password: DOCTOR.password })
      .expect(200);
  });

  it('blocks an admin from deactivating their own account', async () => {
    await asAdmin(request(app).patch(`/api/users/${admin._id}/status`))
      .send({ isActive: false })
      .expect(400);
  });
});

describe('DELETE /api/users/:id (admin)', () => {
  it('deletes an account that never acted, and its login stops working', async () => {
    const doctor = await createDoctorViaApi();

    await asAdmin(request(app).delete(`/api/users/${doctor._id}`)).expect(200);

    await asAdmin(request(app).get(`/api/users/${doctor._id}`)).expect(404);
    await request(app)
      .post('/api/auth/login')
      .send({ email: DOCTOR.email, password: DOCTOR.password })
      .expect(401);
  });

  it('records the deletion in the audit trail', async () => {
    const doctor = await createDoctorViaApi();
    await asAdmin(request(app).delete(`/api/users/${doctor._id}`)).expect(200);

    const res = await asAdmin(
      request(app).get('/api/admin/audit-logs').query({ action: 'user_deleted' })
    ).expect(200);

    expect(res.body.data.logs).toHaveLength(1);
    expect(res.body.data.logs[0].description).toContain(DOCTOR.email);
  });

  it('refuses an account that already owns records, and keeps it intact', async () => {
    const departmentId = String((await createDepartment('Cardiology'))._id);
    const doctor = await createDoctorProfile(app, adminToken, departmentId);

    const res = await asAdmin(request(app).delete(`/api/users/${doctor.userId}`)).expect(409);

    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('doctor profile');

    // The refusal must not have half-applied.
    await asAdmin(request(app).get(`/api/users/${doctor.userId}`)).expect(200);
  });

  it('blocks an admin from deleting their own account', async () => {
    await asAdmin(request(app).delete(`/api/users/${admin._id}`)).expect(400);
    await asAdmin(request(app).get(`/api/users/${admin._id}`)).expect(200);
  });

  it('refuses a patient portal login, which is retired from the patient record', async () => {
    const portal = await createAdmin({
      email: 'portal@test.local',
      password: 'PortalPass123!',
      role: 'patient',
      firstName: 'Amara',
      lastName: 'Nwosu',
    });

    await asAdmin(request(app).delete(`/api/users/${portal._id}`)).expect(400);
  });

  it('returns 404 for a missing id and 400 for a malformed one', async () => {
    await asAdmin(request(app).delete('/api/users/507f1f77bcf86cd799439011')).expect(404);
    await asAdmin(request(app).delete('/api/users/not-an-id')).expect(400);
  });
});

describe('role-based access control', () => {
  it('rejects unauthenticated access to user management with 401', async () => {
    await request(app).get('/api/users').expect(401);
    await request(app).post('/api/users').send(DOCTOR).expect(401);
  });

  it.each(['doctor', 'receptionist', 'nurse'] as const)(
    'rejects %s access to user management with 403',
    async (role) => {
      const email = `${role}@test.local`;
      const password = 'StaffPass123!';
      await createAdmin({ email, password, role, firstName: 'Staff' });
      const token = await loginAs(app, { email, password });

      const bearer = (req: SupertestTest): SupertestTest =>
        req.set('Authorization', `Bearer ${token}`);

      await bearer(request(app).get('/api/users')).expect(403);
      await bearer(request(app).post('/api/users')).send(DOCTOR).expect(403);
      await bearer(request(app).get(`/api/users/${admin._id}`)).expect(403);
      await bearer(request(app).patch(`/api/users/${admin._id}`))
        .send({ firstName: 'Hacked' })
        .expect(403);
      await bearer(request(app).patch(`/api/users/${admin._id}/status`))
        .send({ isActive: false })
        .expect(403);
      await bearer(request(app).delete(`/api/users/${admin._id}`)).expect(403);
    }
  );

  it('still allows non-admin roles to use /api/auth/me', async () => {
    await createAdmin({ email: 'nurse@test.local', password: 'StaffPass123!', role: 'nurse' });
    const token = await loginAs(app, { email: 'nurse@test.local', password: 'StaffPass123!' });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.user.role).toBe('nurse');
  });
});
