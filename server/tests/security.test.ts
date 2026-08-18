import './env.js';
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import createApp from '../app.js';
import AuditLog from '../models/AuditLog.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import Doctor from '../models/Doctor.js';
import { httpLogSerializers } from '../utils/logger.js';
import { setupTestDB, createAdmin, createStaff, loginAs, ADMIN } from './helpers.js';
import { createActivePatient, createDepartment } from './phase3Helpers.js';

const app = createApp();

setupTestDB();

let adminToken: string;
let adminId: string;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const login = (email: string, password: string) =>
  request(app).post('/api/auth/login').send({ email, password });

beforeEach(async () => {
  const admin = await createAdmin();
  adminId = String(admin._id);
  adminToken = await loginAs(app, ADMIN);
});

describe('authentication hardening', () => {
  it('does not reveal whether an account exists', async () => {
    const unknown = await login('nobody@test.local', 'WrongPass123!').expect(401);
    const wrongPassword = await login(ADMIN.email, 'WrongPass123!').expect(401);

    // Byte-identical bodies: an attacker learns nothing from the response.
    expect(unknown.body).toEqual({ success: false, message: 'Invalid credentials' });
    expect(wrongPassword.body).toEqual({ success: false, message: 'Invalid credentials' });
  });

  it('rejects invalid, malformed, and expired tokens', async () => {
    await request(app).get('/api/auth/me').expect(401);
    await request(app).get('/api/auth/me').set(auth('not-a-token')).expect(401);
    await request(app).get('/api/auth/me').set({ Authorization: adminToken }).expect(401); // no Bearer

    // Signed with the right secret but already expired.
    const expired = jwt.sign({ userId: adminId, role: 'admin' }, process.env.JWT_SECRET as string, {
      expiresIn: '-1s',
    });
    const res = await request(app).get('/api/auth/me').set(auth(expired)).expect(401);
    expect(res.body.message).toMatch(/expired/i);

    // Signed with the wrong secret.
    const forged = jwt.sign({ userId: adminId, role: 'admin' }, 'attacker-secret');
    await request(app).get('/api/auth/me').set(auth(forged)).expect(401);
  });

  it('a token cannot grant a role the account does not hold', async () => {
    const nurse = await createStaff('nurse');
    const nurseUser = await User.findOne({ email: nurse.email });

    // Forged claim of admin, correctly signed: the middleware re-reads the
    // user from the database, so the claim is ignored.
    const forgedRole = jwt.sign(
      { userId: String(nurseUser!._id), role: 'admin' },
      process.env.JWT_SECRET as string,
      { expiresIn: '1h' }
    );

    await request(app).get('/api/users').set(auth(forgedRole)).expect(403);
    await request(app).get('/api/admin/audit-logs').set(auth(forgedRole)).expect(403);
  });

  it('inactive and suspended accounts cannot authenticate or use old tokens', async () => {
    const staff = await createStaff('receptionist');
    const staffUser = await User.findOne({ email: staff.email });
    const validToken = await loginAs(app, staff);

    // Suspend the account.
    await request(app)
      .patch(`/api/users/${staffUser!._id}/status`)
      .set(auth(adminToken))
      .send({ status: 'suspended' })
      .expect(200);

    const blocked = await login(staff.email, staff.password).expect(403);
    expect(blocked.body.message).toMatch(/suspended/i);

    // The token issued before suspension stops working immediately.
    await request(app).get('/api/auth/me').set(auth(validToken)).expect(403);

    // Deactivation behaves the same way.
    await request(app)
      .patch(`/api/users/${staffUser!._id}/status`)
      .set(auth(adminToken))
      .send({ status: 'inactive' })
      .expect(200);
    await login(staff.email, staff.password).expect(403);

    // Reactivation restores access.
    await request(app)
      .patch(`/api/users/${staffUser!._id}/status`)
      .set(auth(adminToken))
      .send({ status: 'active' })
      .expect(200);
    await login(staff.email, staff.password).expect(200);
  });

  it('temporarily locks an account after repeated failures, then recovers', async () => {
    process.env.LOGIN_LOCK_THRESHOLD = '3';
    const app2 = createApp();
    const staff = await createStaff('nurse');

    try {
      for (let i = 0; i < 2; i += 1) {
        await request(app2)
          .post('/api/auth/login')
          .send({ email: staff.email, password: `wrong-${i}` })
          .expect(401);
      }

      // The third failure trips the lock but still answers 401 (no hint).
      await request(app2)
        .post('/api/auth/login')
        .send({ email: staff.email, password: 'wrong-3' })
        .expect(401);

      // Now even the CORRECT password is throttled, with the same wording
      // the IP rate limiter uses, so the lock is not an oracle.
      const locked = await request(app2)
        .post('/api/auth/login')
        .send({ email: staff.email, password: staff.password })
        .expect(429);
      expect(locked.body.message).toMatch(/too many failed login attempts/i);

      // Clearing the lock (as an administrator would after verification).
      await User.updateOne({ email: staff.email }, { $set: { lockedUntil: null } });
      await request(app2)
        .post('/api/auth/login')
        .send({ email: staff.email, password: staff.password })
        .expect(200);
    } finally {
      delete process.env.LOGIN_LOCK_THRESHOLD;
    }
  });
});

describe('privilege escalation', () => {
  it('nobody can change their own role', async () => {
    const res = await request(app)
      .patch(`/api/users/${adminId}`)
      .set(auth(adminToken))
      .send({ role: 'doctor' })
      .expect(400);
    expect(res.body.message).toMatch(/own role/i);

    const fresh = await User.findById(adminId);
    expect(fresh?.role).toBe('admin');
  });

  it('non-admins cannot reach user management at all', async () => {
    for (const role of ['doctor', 'nurse', 'receptionist', 'pharmacist', 'lab_technician'] as const) {
      const token = await loginAs(app, await createStaff(role));
      const user = await User.findOne({ role });

      await request(app).get('/api/users').set(auth(token)).expect(403);
      await request(app)
        .post('/api/users')
        .set(auth(token))
        .send({
          firstName: 'Self',
          lastName: 'Made',
          email: `self-${role}@test.local`,
          password: 'Password123!',
          role: 'admin',
        })
        .expect(403);
      // The decisive check: elevating your own account to admin.
      await request(app)
        .patch(`/api/users/${user!._id}`)
        .set(auth(token))
        .send({ role: 'admin' })
        .expect(403);

      const unchanged = await User.findById(user!._id);
      expect(unchanged?.role).toBe(role);
    }
  });

  it('admins cannot change their own account status', async () => {
    await request(app)
      .patch(`/api/users/${adminId}/status`)
      .set(auth(adminToken))
      .send({ status: 'suspended' })
      .expect(400);
    expect((await User.findById(adminId))?.status).toBe('active');
  });
});

describe('audit trail', () => {
  it('records successful and failed logins with actor context, never the password', async () => {
    await login(ADMIN.email, 'WrongPass123!').expect(401);
    await login('ghost@test.local', 'WrongPass123!').expect(401);

    const failures = await AuditLog.find({ action: 'login_failed' }).sort({ createdAt: 1 });
    expect(failures).toHaveLength(2);
    expect(failures[0]!.metadata).toMatchObject({ reason: 'bad_password' });
    expect(failures[1]!.metadata).toMatchObject({ reason: 'unknown_account' });
    expect(failures[0]!.ipAddress).toBeTruthy();
    expect(failures[0]!.requestId).toBeTruthy();

    // The login in beforeEach was recorded as a success.
    const success = await AuditLog.findOne({ action: 'login' });
    expect(String(success?.actorId)).toBe(adminId);
    expect(success?.actorRole).toBe('admin');

    // No entry anywhere contains credentials.
    const dump = JSON.stringify(await AuditLog.find({}).lean());
    expect(dump).not.toMatch(/WrongPass123!/);
    expect(dump).not.toMatch(new RegExp(ADMIN.password));
    expect(dump).not.toMatch(/\$2[aby]\$/); // bcrypt hash
    expect(dump).not.toMatch(/"password"/);
  });

  it('records business actions with the acting user', async () => {
    const receptionist = await createStaff('receptionist');
    const receptionistToken = await loginAs(app, receptionist);

    const patient = await request(app)
      .post('/api/patients')
      .set(auth(receptionistToken))
      .send({
        firstName: 'Aud',
        lastName: 'Trail',
        dateOfBirth: '1990-01-01',
        gender: 'female',
        phone: '555-0143',
      })
      .expect(201);

    const entry = await AuditLog.findOne({ action: 'patient_created' });
    expect(entry).not.toBeNull();
    expect(entry?.actorRole).toBe('receptionist');
    expect(entry?.description).toContain(patient.body.data.patient.patientId);

    // A user/role change is audited distinctly from a plain update.
    const target = await User.findOne({ role: 'receptionist' });
    await request(app)
      .patch(`/api/users/${target!._id}`)
      .set(auth(adminToken))
      .send({ role: 'nurse' })
      .expect(200);
    expect(await AuditLog.countDocuments({ action: 'user_role_changed' })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'user_updated' })).toBe(1);
  });

  it('strips credential-shaped metadata even if a call site passes it', async () => {
    const { recordAudit } = await import('../services/auditService.js');
    await recordAudit({
      action: 'user_updated',
      resourceType: 'user',
      description: 'Metadata sanitisation check.',
      metadata: { password: 'hunter2', token: 'abc.def', apiKey: 'k-1', role: 'nurse' },
    });

    const entry = await AuditLog.findOne({ description: 'Metadata sanitisation check.' });
    expect(entry?.metadata).toEqual({ role: 'nurse' });
  });

  it('is admin-only and read-only', async () => {
    for (const role of ['doctor', 'nurse', 'receptionist', 'pharmacist', 'lab_technician'] as const) {
      const token = await loginAs(app, await createStaff(role));
      await request(app).get('/api/admin/audit-logs').set(auth(token)).expect(403);
    }
    await request(app).get('/api/admin/audit-logs').expect(401);

    const list = await request(app).get('/api/admin/audit-logs').set(auth(adminToken)).expect(200);
    expect(list.body.data.logs.length).toBeGreaterThan(0);

    // No write route exists for the trail.
    const id = list.body.data.logs[0]._id as string;
    await request(app).post('/api/admin/audit-logs').set(auth(adminToken)).send({}).expect(404);
    await request(app).patch(`/api/admin/audit-logs/${id}`).set(auth(adminToken)).send({}).expect(404);
    await request(app).delete(`/api/admin/audit-logs/${id}`).set(auth(adminToken)).expect(404);
  });

  it('filters, sorts, and paginates the trail', async () => {
    await login(ADMIN.email, 'WrongPass123!').expect(401);

    const byAction = await request(app)
      .get('/api/admin/audit-logs')
      .query({ action: 'login_failed' })
      .set(auth(adminToken))
      .expect(200);
    expect(byAction.body.data.logs).toHaveLength(1);

    const byRole = await request(app)
      .get('/api/admin/audit-logs')
      .query({ actorRole: 'admin' })
      .set(auth(adminToken))
      .expect(200);
    expect(byRole.body.data.logs.length).toBeGreaterThan(0);

    const byResource = await request(app)
      .get('/api/admin/audit-logs')
      .query({ resourceType: 'auth' })
      .set(auth(adminToken))
      .expect(200);
    expect(byResource.body.data.logs.length).toBeGreaterThan(0);

    const paged = await request(app)
      .get('/api/admin/audit-logs')
      .query({ page: 1, limit: 1 })
      .set(auth(adminToken))
      .expect(200);
    expect(paged.body.data.logs).toHaveLength(1);
    expect(paged.body.data.pagination.totalPages).toBeGreaterThan(1);

    const searched = await request(app)
      .get('/api/admin/audit-logs')
      .query({ search: 'signed in' })
      .set(auth(adminToken))
      .expect(200);
    expect(searched.body.data.logs.length).toBeGreaterThan(0);

    const none = await request(app)
      .get('/api/admin/audit-logs')
      .query({ from: '2099-01-01' })
      .set(auth(adminToken))
      .expect(200);
    expect(none.body.data.logs).toHaveLength(0);
  });
});

describe('sensitive data protection', () => {
  it('no user-facing endpoint returns credentials or security counters', async () => {
    const staff = await createStaff('nurse');
    const staffToken = await loginAs(app, staff);

    const bodies = await Promise.all([
      login(ADMIN.email, ADMIN.password).then((r) => r.body),
      request(app).get('/api/auth/me').set(auth(adminToken)).then((r) => r.body),
      request(app).get('/api/users').set(auth(adminToken)).then((r) => r.body),
      request(app).get('/api/auth/me').set(auth(staffToken)).then((r) => r.body),
    ]);

    for (const body of bodies) {
      const dump = JSON.stringify(body);
      expect(dump).not.toMatch(/"password"/);
      expect(dump).not.toMatch(/\$2[aby]\$/);
      expect(dump).not.toMatch(/failedLoginAttempts/);
      expect(dump).not.toMatch(/lockedUntil/);
    }
  });

  it('system health exposes state, never secrets', async () => {
    const res = await request(app).get('/api/admin/system-health').set(auth(adminToken)).expect(200);

    expect(res.body.data.api.status).toBe('ok');
    expect(res.body.data.database.status).toBe('connected');
    expect(res.body.data.traffic.requests).toBeGreaterThan(0);

    const dump = JSON.stringify(res.body);
    expect(dump).not.toMatch(process.env.JWT_SECRET as string);
    expect(dump).not.toMatch(/mongodb(\+srv)?:\/\//);
    expect(dump).not.toMatch(/secret/i);
    expect(dump).not.toMatch(/password/i);
  });

  it('request logging never serializes credentials', () => {
    const serialized = httpLogSerializers.req({
      id: 'req-1',
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: '::1',
      headers: {
        authorization: 'Bearer super-secret-token',
        cookie: 'session=super-secret-cookie',
        'user-agent': 'vitest',
      },
    });

    const dump = JSON.stringify(serialized);
    expect(dump).not.toMatch(/super-secret/);
    expect(dump).not.toMatch(/authorization/i);
    expect(dump).not.toMatch(/cookie/i);
    expect(serialized).toMatchObject({ method: 'POST', url: '/api/auth/login', userAgent: 'vitest' });
  });

  it('internal errors return a safe message with no stack trace', async () => {
    // Malformed JSON reaches the central error handler.
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": broken')
      .expect(400);

    expect(res.body).toMatchObject({ success: false });
    expect(JSON.stringify(res.body)).not.toMatch(/at \w+ \(/); // no stack frames
    expect(res.body).not.toHaveProperty('stack');
  });
});

describe('cross-user and cross-tenant access', () => {
  it('a user cannot read or mutate another user’s notifications', async () => {
    const nurse = await createStaff('nurse');
    const nurseUser = await User.findOne({ email: nurse.email });
    const nurseToken = await loginAs(app, nurse);

    const { createNotification } = await import('../services/notificationService.js');
    const adminNote = await createNotification({
      recipientId: adminId as unknown as never,
      type: 'system',
      title: 'Admin only',
      message: 'Private.',
      dedupeKey: 'admin-private',
    });
    await createNotification({
      recipientId: nurseUser!._id,
      type: 'system',
      title: 'Nurse only',
      message: 'Private.',
      dedupeKey: 'nurse-private',
    });

    const inbox = await request(app).get('/api/notifications').set(auth(nurseToken)).expect(200);
    expect(inbox.body.data.notifications).toHaveLength(1);
    expect(inbox.body.data.notifications[0].title).toBe('Nurse only');

    await request(app)
      .patch(`/api/notifications/${adminNote!._id}/read`)
      .set(auth(nurseToken))
      .expect(404);
    expect((await Notification.findById(adminNote!._id))?.isRead).toBe(false);
  });

  it('module role boundaries hold across the whole API', async () => {
    const patientId = String((await createActivePatient())._id);

    const tokens: Record<string, string> = {};
    for (const role of ['doctor', 'nurse', 'receptionist', 'pharmacist', 'lab_technician'] as const) {
      tokens[role] = await loginAs(app, await createStaff(role));
    }

    // The doctor needs a linked Doctor profile: clinical reports are
    // scoped to it, so a doctor-role account without one is (correctly)
    // refused. Give this one a profile so the matrix tests route-level
    // RBAC rather than that separate guard.
    const department = await createDepartment('RBAC Matrix');
    const doctorUser = await User.findOne({ role: 'doctor' });
    await Doctor.create({
      userId: doctorUser!._id,
      doctorId: 'DOC-9001',
      firstName: doctorUser!.firstName,
      lastName: doctorUser!.lastName,
      email: doctorUser!.email,
      specialization: 'General',
      departmentId: department._id,
    });

    // [path, method, allowed roles]
    const matrix: Array<[string, 'get' | 'post', string[]]> = [
      ['/api/users', 'get', []],
      ['/api/admin/audit-logs', 'get', []],
      ['/api/admin/system-health', 'get', []],
      ['/api/analytics/overview', 'get', []],
      ['/api/reports/billing', 'get', ['receptionist']],
      ['/api/reports/pharmacy', 'get', ['pharmacist']],
      ['/api/reports/laboratory', 'get', ['lab_technician']],
      ['/api/reports/clinical', 'get', ['doctor']],
      // Nurses read the catalogue so a dose is charted against a real
      // medicine rather than a typed drug name. Read-only — the writes below
      // and the rest of the pharmacy module stay closed to them.
      ['/api/pharmacy/medicines', 'get', ['pharmacist', 'nurse']],
      // Ward nurses draw samples, so they see the queue and may record a
      // collection. Rejecting a sample remains a bench judgement.
      ['/api/laboratory/samples', 'get', ['lab_technician', 'nurse']],
      ['/api/billing/invoices', 'get', ['receptionist', 'doctor', 'nurse']],
      ['/api/inpatient/admissions', 'get', ['receptionist', 'doctor', 'nurse']],
      ['/api/patients', 'get', ['receptionist', 'doctor', 'nurse']],
    ];

    for (const [path, method, allowed] of matrix) {
      for (const [role, token] of Object.entries(tokens)) {
        const res = await request(app)[method](path).set(auth(token));
        if (allowed.includes(role)) {
          expect([200, 201]).toContain(res.status);
        } else {
          expect(res.status).toBe(403);
        }
      }
      // The administrator always has access.
      const adminRes = await request(app)[method](path).set(auth(adminToken));
      expect([200, 201]).toContain(adminRes.status);
      // And nobody gets in without a token.
      await request(app)[method](path).expect(401);
    }

    // Pharmacy and lab staff cannot reach patient records at all.
    for (const role of ['pharmacist', 'lab_technician'] as const) {
      await request(app).get(`/api/patients/${patientId}`).set(auth(tokens[role]!)).expect(403);
    }
  });
});

describe('system settings', () => {
  it('is readable by any signed-in user but writable only by admins', async () => {
    const nurseToken = await loginAs(app, await createStaff('nurse'));

    const read = await request(app).get('/api/admin/settings').set(auth(nurseToken)).expect(200);
    expect(read.body.data.settings.hospitalName).toBeTruthy();
    expect(read.body.data.settings.currency).toBe('USD');

    await request(app)
      .patch('/api/admin/settings')
      .set(auth(nurseToken))
      .send({ hospitalName: 'Hijacked' })
      .expect(403);

    const updated = await request(app)
      .patch('/api/admin/settings')
      .set(auth(adminToken))
      .send({ hospitalName: 'Riverside General', appointmentSlotMinutes: 20, currency: 'EUR' })
      .expect(200);
    expect(updated.body.data.settings).toMatchObject({
      hospitalName: 'Riverside General',
      appointmentSlotMinutes: 20,
      currency: 'EUR',
    });

    // The change is audited.
    expect(await AuditLog.countDocuments({ action: 'settings_updated' })).toBe(1);

    await request(app).patch('/api/admin/settings').expect(401);
  });

  it('validates settings and rejects unknown keys', async () => {
    await request(app)
      .patch('/api/admin/settings')
      .set(auth(adminToken))
      .send({ appointmentSlotMinutes: 2 })
      .expect(400);
    await request(app)
      .patch('/api/admin/settings')
      .set(auth(adminToken))
      .send({ hospitalName: '' })
      .expect(400);
    await request(app)
      .patch('/api/admin/settings')
      .set(auth(adminToken))
      .send({ contactEmail: 'not-an-email' })
      .expect(400);
    // An attacker cannot inject arbitrary configuration.
    await request(app)
      .patch('/api/admin/settings')
      .set(auth(adminToken))
      .send({ isAdmin: true })
      .expect(400);
  });
});
