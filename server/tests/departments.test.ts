import './env.js';
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import createApp from '../app.js';
import { setupTestDB, createAdmin, createStaff, loginAs, ADMIN } from './helpers.js';
import { createDepartment, createDoctorViaApi } from './phase3Helpers.js';

const app = createApp();

setupTestDB();

let adminToken: string;

beforeEach(async () => {
  await createAdmin();
  adminToken = await loginAs(app, ADMIN);
});

const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });

describe('POST /api/departments', () => {
  it('creates a department with a generated ID', async () => {
    const res = await request(app)
      .post('/api/departments')
      .set(asAdmin())
      .send({ name: 'Neurology', description: 'Brain and nervous system' })
      .expect(201);

    const dept = res.body.data.department;
    expect(dept.departmentId).toBe('DEP-001');
    expect(dept.name).toBe('Neurology');
    expect(dept.status).toBe('active');
  });

  it('rejects a duplicate name with 409', async () => {
    await createDepartment('Cardiology');
    const res = await request(app)
      .post('/api/departments')
      .set(asAdmin())
      .send({ name: 'Cardiology' })
      .expect(409);
    expect(res.body.success).toBe(false);
  });

  it('rejects a missing name with 400', async () => {
    await request(app).post('/api/departments').set(asAdmin()).send({}).expect(400);
  });

  it('is admin only', async () => {
    const receptionist = await createStaff('receptionist');
    const token = await loginAs(app, receptionist);
    await request(app)
      .post('/api/departments')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Blocked' })
      .expect(403);
  });
});

describe('GET /api/departments', () => {
  it('admin sees all departments; other roles see only active ones', async () => {
    await createDepartment('Cardiology', 'active');
    await createDepartment('Archived Unit', 'inactive');

    const adminRes = await request(app).get('/api/departments').set(asAdmin()).expect(200);
    expect(adminRes.body.data.departments).toHaveLength(2);

    const nurse = await createStaff('nurse');
    const nurseToken = await loginAs(app, nurse);
    const nurseRes = await request(app)
      .get('/api/departments')
      .set('Authorization', `Bearer ${nurseToken}`)
      .expect(200);
    expect(nurseRes.body.data.departments).toHaveLength(1);
    expect(nurseRes.body.data.departments[0].name).toBe('Cardiology');
  });
});

describe('PATCH /api/departments/:id', () => {
  it('updates name and description', async () => {
    const dept = await createDepartment('Cardiology');
    const res = await request(app)
      .patch(`/api/departments/${dept._id}`)
      .set(asAdmin())
      .send({ description: 'Heart care' })
      .expect(200);
    expect(res.body.data.department.description).toBe('Heart care');
  });

  it('is admin only', async () => {
    const dept = await createDepartment('Cardiology');
    const doctor = await createStaff('doctor');
    const token = await loginAs(app, doctor);
    await request(app)
      .patch(`/api/departments/${dept._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'Nope' })
      .expect(403);
  });
});

describe('PATCH /api/departments/:id/status', () => {
  it('deactivates and reactivates an empty department', async () => {
    const dept = await createDepartment('Cardiology');

    await request(app)
      .patch(`/api/departments/${dept._id}/status`)
      .set(asAdmin())
      .send({ status: 'inactive' })
      .expect(200);

    await request(app)
      .patch(`/api/departments/${dept._id}/status`)
      .set(asAdmin())
      .send({ status: 'active' })
      .expect(200);
  });

  it('refuses to deactivate a department that still has active doctors', async () => {
    const dept = await createDepartment('Cardiology');
    await createDoctorViaApi(app, adminToken, String(dept._id));

    const res = await request(app)
      .patch(`/api/departments/${dept._id}/status`)
      .set(asAdmin())
      .send({ status: 'inactive' })
      .expect(400);

    expect(res.body.message).toMatch(/active doctor/i);
  });

  it('rejects an invalid status with 400', async () => {
    const dept = await createDepartment('Cardiology');
    await request(app)
      .patch(`/api/departments/${dept._id}/status`)
      .set(asAdmin())
      .send({ status: 'deleted' })
      .expect(400);
  });
});
