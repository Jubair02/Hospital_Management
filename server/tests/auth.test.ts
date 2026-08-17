import './env.js';
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import createApp from '../app.js';
import { setupTestDB, createAdmin, createStaff, loginAs, ADMIN } from './helpers.js';

const app = createApp();

setupTestDB();

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await createAdmin();
  });

  it('logs in with valid credentials and returns a token + user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN.email, password: ADMIN.password })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.email).toBe(ADMIN.email);
    expect(res.body.data.user.role).toBe('admin');
  });

  it('never returns the password field', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN.email, password: ADMIN.password })
      .expect(200);

    expect(res.body.data.user).not.toHaveProperty('password');
  });

  it('rejects a wrong password with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN.email, password: 'wrong-password-1' })
      .expect(401);

    expect(res.body).toEqual({ success: false, message: 'Invalid credentials' });
  });

  it('rejects an unknown email with the same 401 message (no user enumeration)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@test.local', password: 'whatever-123' })
      .expect(401);

    expect(res.body).toEqual({ success: false, message: 'Invalid credentials' });
  });

  it('rejects missing fields with 400', async () => {
    await request(app).post('/api/auth/login').send({ email: ADMIN.email }).expect(400);
    await request(app).post('/api/auth/login').send({ password: 'x' }).expect(400);
    await request(app).post('/api/auth/login').send({}).expect(400);
  });

  it('rejects a malformed email with 400', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: 'whatever-123' })
      .expect(400);
  });

  it('rejects a deactivated account with 403', async () => {
    await createAdmin({ email: 'inactive@test.local', isActive: false });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'inactive@test.local', password: ADMIN.password })
      .expect(403);

    expect(res.body.success).toBe(false);
  });

  it('accepts the email case-insensitively', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN.email.toUpperCase(), password: ADMIN.password })
      .expect(200);
  });
});

describe('GET /api/auth/me', () => {
  beforeEach(async () => {
    await createAdmin();
  });

  it('returns the current user for a valid token', async () => {
    const token = await loginAs(app, ADMIN);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.user.email).toBe(ADMIN.email);
    expect(res.body.data.user).not.toHaveProperty('password');
  });

  it('rejects a missing token with 401', async () => {
    await request(app).get('/api/auth/me').expect(401);
  });

  it('rejects a malformed token with 401', async () => {
    await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.real.token')
      .expect(401);
  });
});

/**
 * Self-service profile editing. The interesting cases are all about what the
 * endpoint refuses: it is reachable by anyone with a session, so every field
 * it accepts is a field a borrowed session can rewrite.
 */
describe('PATCH /api/auth/me', () => {
  beforeEach(async () => {
    await createAdmin();
  });

  // Not async: callers chain `.expect()` onto the supertest request itself.
  const patch = (token: string, body: Record<string, unknown>) =>
    request(app).patch('/api/auth/me').set('Authorization', `Bearer ${token}`).send(body);

  it('updates own name and phone, and audits the change', async () => {
    const token = await loginAs(app, ADMIN);

    const res = await patch(token, {
      firstName: 'Amara',
      lastName: 'Sesay',
      phone: '+1 555-0142',
    }).expect(200);

    expect(res.body.data.user.firstName).toBe('Amara');
    expect(res.body.data.user.lastName).toBe('Sesay');
    expect(res.body.data.user.phone).toBe('+1 555-0142');
    expect(res.body.data.user).not.toHaveProperty('password');

    // The change survives a re-read, not just the response body.
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.data.user.firstName).toBe('Amara');

    const { default: AuditLog } = await import('../models/AuditLog.js');
    const entry = await AuditLog.findOne({ action: 'user_updated' });
    expect(entry).not.toBeNull();
    expect(entry!.toJSON()).toMatchObject({ metadata: { self: true } });
  });

  it('refuses to change the sign-in email', async () => {
    const token = await loginAs(app, ADMIN);

    await patch(token, { email: 'attacker@test.local' }).expect(400);

    // The original address still signs in, and the new one does not exist.
    await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN.email, password: ADMIN.password })
      .expect(200);
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'attacker@test.local', password: ADMIN.password })
      .expect(401);
  });

  it('refuses to change own role or status', async () => {
    const { email, password } = await createStaff('nurse');
    const token = await loginAs(app, { email, password });

    await patch(token, { role: 'admin' }).expect(400);
    await patch(token, { status: 'suspended' }).expect(400);

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.data.user.role).toBe('nurse');
  });

  it('rejects an empty or over-long name, and an empty payload', async () => {
    const token = await loginAs(app, ADMIN);

    await patch(token, { firstName: '   ' }).expect(400);
    await patch(token, { firstName: 'x'.repeat(51) }).expect(400);
    await patch(token, {}).expect(400);
  });

  it('lets a phone number be cleared', async () => {
    const token = await loginAs(app, ADMIN);

    await patch(token, { phone: '+1 555-0142' }).expect(200);
    const res = await patch(token, { phone: '' }).expect(200);
    expect(res.body.data.user.phone ?? '').toBe('');
  });

  it('refuses a patient portal login, whose details live on the patient record', async () => {
    const portal = await createAdmin({
      email: 'portal.profile@test.local',
      password: 'PortalPass123!',
      role: 'patient',
      firstName: 'Tomas',
      lastName: 'Ndiaye',
    });
    const token = await loginAs(app, {
      email: 'portal.profile@test.local',
      password: 'PortalPass123!',
    });

    const res = await patch(token, { firstName: 'Changed' }).expect(400);
    expect(res.body.message).toMatch(/profile page/i);

    const { default: User } = await import('../models/User.js');
    const unchanged = await User.findById(portal._id);
    expect(unchanged!.firstName).toBe('Tomas');
  });

  it('rejects an unauthenticated call with 401', async () => {
    await request(app).patch('/api/auth/me').send({ firstName: 'Nobody' }).expect(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('acknowledges logout for an authenticated user', async () => {
    await createAdmin();
    const token = await loginAs(app, ADMIN);

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  it('requires authentication', async () => {
    await request(app).post('/api/auth/logout').expect(401);
  });
});

describe('request correlation', () => {
  it('assigns an X-Request-Id to every response', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('honors a well-formed inbound X-Request-Id', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('X-Request-Id', 'upstream-abc-123')
      .expect(200);

    expect(res.headers['x-request-id']).toBe('upstream-abc-123');
  });

  it('replaces a malformed inbound X-Request-Id', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('X-Request-Id', 'bad id with spaces $$$')
      .expect(200);

    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('error envelope', () => {
  it('returns a consistent shape for unknown routes', async () => {
    const res = await request(app).get('/api/nope').expect(404);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.message).toBe('string');
  });

  it('returns 400 for malformed JSON bodies', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": broken')
      .expect(400);

    expect(res.body.success).toBe(false);
  });
});

describe('change own password', () => {
  const NEW_PASSWORD = 'BrandNewPass456!';

  beforeEach(async () => {
    await createAdmin();
  });

  it('changes the password after verifying the current one, and audits it', async () => {
    const token = await loginAs(app, ADMIN);

    await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: ADMIN.password, newPassword: NEW_PASSWORD })
      .expect(200);

    // Old password no longer works; the new one does.
    await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN.email, password: ADMIN.password })
      .expect(401);
    await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN.email, password: NEW_PASSWORD })
      .expect(200);

    // Audited without any credential material.
    const { default: AuditLog } = await import('../models/AuditLog.js');
    const entry = await AuditLog.findOne({ action: 'password_changed' });
    expect(entry).not.toBeNull();
    expect(JSON.stringify(entry!.toJSON())).not.toMatch(NEW_PASSWORD);
    expect(JSON.stringify(entry!.toJSON())).not.toMatch(ADMIN.password);
  });

  it('rejects a wrong current password with 400 (session stays valid)', async () => {
    const token = await loginAs(app, ADMIN);

    await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'not-the-password', newPassword: NEW_PASSWORD })
      .expect(400);

    // The original password still works.
    await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN.email, password: ADMIN.password })
      .expect(200);
  });

  it('rejects weak or unchanged new passwords and unauthenticated calls', async () => {
    const token = await loginAs(app, ADMIN);

    await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: ADMIN.password, newPassword: 'short' })
      .expect(400);

    await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: ADMIN.password, newPassword: ADMIN.password })
      .expect(400);

    await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: ADMIN.password, newPassword: NEW_PASSWORD })
      .expect(401);
  });
});
