import './env.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import createApp from '../app.js';
import { setupTestDB, createAdmin, loginAs, ADMIN } from './helpers.js';

setupTestDB();

describe('login rate limiting', () => {
  beforeEach(async () => {
    await createAdmin();
  });

  afterEach(() => {
    process.env.LOGIN_RATE_LIMIT_MAX = '1000';
  });

  it('blocks further attempts with 429 after too many failures', async () => {
    process.env.LOGIN_RATE_LIMIT_MAX = '3';
    const app = createApp(); // limiter reads env at app creation

    for (let i = 0; i < 3; i += 1) {
      await request(app)
        .post('/api/auth/login')
        .send({ email: ADMIN.email, password: `wrong-${i}` })
        .expect(401);
    }

    // Fourth attempt is blocked even with the CORRECT password.
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN.email, password: ADMIN.password })
      .expect(429);

    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/too many/i);
  });

  it('does not count successful logins against the limit', async () => {
    process.env.LOGIN_RATE_LIMIT_MAX = '3';
    const app = createApp();

    // Many successful logins in a row — never blocked.
    for (let i = 0; i < 5; i += 1) {
      await request(app)
        .post('/api/auth/login')
        .send({ email: ADMIN.email, password: ADMIN.password })
        .expect(200);
    }
  });

  it('does not rate-limit other endpoints', async () => {
    process.env.LOGIN_RATE_LIMIT_MAX = '3';
    const app = createApp();

    for (let i = 0; i < 10; i += 1) {
      await request(app).get('/api/health').expect(200);
    }
  });
});

/**
 * Changing a password requires proving the current one, which makes the
 * endpoint a password oracle for anyone who reaches an already-signed-in
 * session. Unlimited guesses there turn temporary access to a workstation
 * into permanent ownership of the account.
 */
describe('password-change rate limiting', () => {
  const NEW_PASSWORD = 'BrandNewPass456!';

  beforeEach(async () => {
    await createAdmin();
  });

  afterEach(() => {
    process.env.PASSWORD_CHANGE_RATE_LIMIT_MAX = '1000';
  });

  const wrongGuess = (app: ReturnType<typeof createApp>, token: string) =>
    request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'not-the-password', newPassword: NEW_PASSWORD });

  it('blocks further attempts with 429 after too many wrong current passwords', async () => {
    process.env.PASSWORD_CHANGE_RATE_LIMIT_MAX = '3';
    const app = createApp();
    const token = await loginAs(app, ADMIN);

    for (let i = 0; i < 3; i += 1) {
      await wrongGuess(app, token).expect(400);
    }

    const res = await wrongGuess(app, token).expect(429);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/too many/i);

    // Blocked even with the CORRECT current password — the guesser cannot
    // stumble onto it once the budget is spent.
    await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: ADMIN.password, newPassword: NEW_PASSWORD })
      .expect(429);

    // And the original password still signs in, so nothing was half-applied.
    await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN.email, password: ADMIN.password })
      .expect(200);
  });

  it('does not count a successful change against the limit', async () => {
    process.env.PASSWORD_CHANGE_RATE_LIMIT_MAX = '2';
    const app = createApp();
    const token = await loginAs(app, ADMIN);

    await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: ADMIN.password, newPassword: NEW_PASSWORD })
      .expect(200);

    // A wrong guess afterwards still gets its full budget rather than a 429.
    await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'still-not-it', newPassword: 'AnotherPass789!' })
      .expect(400);
  });
});
