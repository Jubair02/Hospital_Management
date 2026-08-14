import './env.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import createApp from '../app.js';
import { setupTestDB, createAdmin, ADMIN } from './helpers.js';

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
