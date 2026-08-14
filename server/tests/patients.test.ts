import './env.js';
import { describe, it, expect, beforeEach } from 'vitest';
import request, { type Test as SupertestTest } from 'supertest';
import createApp from '../app.js';
import Patient from '../models/Patient.js';
import { setupTestDB, createAdmin, createStaff, loginAs, ADMIN } from './helpers.js';

interface PatientJson {
  _id: string;
  patientId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  bloodGroup: string;
  phone: string;
  email?: string;
  nationalId?: string;
  status: string;
  age: number;
  fullName: string;
  medicalHistory: string[];
  allergies: string[];
  createdBy?: { firstName: string; lastName: string } | null;
}

const app = createApp();

setupTestDB();

const VALID_PATIENT = {
  firstName: 'John',
  lastName: 'Carter',
  dateOfBirth: '1985-04-12',
  gender: 'male',
  phone: '+1 555-0100',
  bloodGroup: 'O+',
  email: 'john.carter@example.com',
  address: '12 Harbor Lane',
  emergencyContact: '+1 555-0199',
  emergencyContactName: 'Ann Carter',
  emergencyContactRelation: 'Spouse',
  nationalId: 'NID-778812',
  maritalStatus: 'married',
  occupation: 'Engineer',
  medicalHistory: ['Hypertension', 'Appendectomy 2014'],
  allergies: ['Penicillin'],
};

let adminToken: string;

beforeEach(async () => {
  await createAdmin();
  adminToken = await loginAs(app, ADMIN);
});

const asAdmin = (req: SupertestTest): SupertestTest =>
  req.set('Authorization', `Bearer ${adminToken}`);

const tokenFor = async (role: 'doctor' | 'receptionist' | 'nurse'): Promise<string> =>
  loginAs(app, await createStaff(role));

const createPatientViaApi = async (
  overrides: Record<string, unknown> = {}
): Promise<PatientJson> => {
  const res = await asAdmin(request(app).post('/api/patients'))
    .send({ ...VALID_PATIENT, ...overrides })
    .expect(201);
  return res.body.data.patient as PatientJson;
};

describe('POST /api/patients', () => {
  it('registers a patient with a generated sequential patient ID', async () => {
    const first = await createPatientViaApi();
    const second = await createPatientViaApi({ phone: '555-0101', email: 'b@example.com' });

    expect(first.patientId).toBe('PAT-000001');
    expect(second.patientId).toBe('PAT-000002');
    expect(first.status).toBe('active');
    expect(first.fullName).toBe('John Carter');
    expect(first.age).toBeGreaterThan(35);
    expect(first.medicalHistory).toEqual(['Hypertension', 'Appendectomy 2014']);
  });

  it('generates unique IDs under concurrent registrations', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        asAdmin(request(app).post('/api/patients'))
          .send({ ...VALID_PATIENT, phone: `555-02${String(i).padStart(2, '0')}` })
          .then((res) => {
            expect(res.status).toBe(201);
            return (res.body.data.patient as PatientJson).patientId;
          })
      )
    );

    expect(new Set(results).size).toBe(8);
    for (const id of results) expect(id).toMatch(/^PAT-\d{6}$/);
  });

  it('records who registered the patient', async () => {
    const created = await createPatientViaApi();
    const res = await asAdmin(request(app).get(`/api/patients/${created._id}`)).expect(200);
    expect((res.body.data.patient as PatientJson).createdBy?.firstName).toBe('Test');
  });

  it('allows a receptionist to register patients', async () => {
    const token = await tokenFor('receptionist');
    await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_PATIENT)
      .expect(201);
  });

  it('rejects missing required fields with 400', async () => {
    const res = await asAdmin(request(app).post('/api/patients'))
      .send({ firstName: 'Only' })
      .expect(400);
    expect(res.body.message).toMatch(/last name/i);
    expect(res.body.message).toMatch(/date of birth/i);
    expect(res.body.message).toMatch(/gender/i);
    expect(res.body.message).toMatch(/phone/i);
  });

  it('rejects a future date of birth with 400', async () => {
    await asAdmin(request(app).post('/api/patients'))
      .send({ ...VALID_PATIENT, dateOfBirth: '2999-01-01' })
      .expect(400);
  });

  it('rejects invalid gender, blood group, email, and phone with 400', async () => {
    await asAdmin(request(app).post('/api/patients'))
      .send({ ...VALID_PATIENT, gender: 'robot' })
      .expect(400);
    await asAdmin(request(app).post('/api/patients'))
      .send({ ...VALID_PATIENT, bloodGroup: 'Z+' })
      .expect(400);
    await asAdmin(request(app).post('/api/patients'))
      .send({ ...VALID_PATIENT, email: 'not-an-email' })
      .expect(400);
    await asAdmin(request(app).post('/api/patients'))
      .send({ ...VALID_PATIENT, phone: 'abc' })
      .expect(400);
  });

  it('accepts a minimal registration (only required fields)', async () => {
    const res = await asAdmin(request(app).post('/api/patients'))
      .send({
        firstName: 'Mina',
        lastName: 'Rahman',
        dateOfBirth: '2001-09-20',
        gender: 'female',
        phone: '01711112222',
      })
      .expect(201);

    const patient = res.body.data.patient as PatientJson;
    expect(patient.bloodGroup).toBe('unknown');
    expect(patient.medicalHistory).toEqual([]);
  });
});

describe('GET /api/patients (search, filter, pagination)', () => {
  beforeEach(async () => {
    await createPatientViaApi(); // John Carter, male, O+
    await createPatientViaApi({
      firstName: 'Sara',
      lastName: 'Nilsson',
      gender: 'female',
      bloodGroup: 'AB-',
      phone: '555-0333',
      email: 'sara.n@example.com',
      nationalId: 'NID-990022',
    });
  });

  it('lists patients with pagination metadata', async () => {
    const res = await asAdmin(request(app).get('/api/patients')).expect(200);
    expect(res.body.data.patients).toHaveLength(2);
    expect(res.body.data.pagination).toMatchObject({ page: 1, total: 2, totalPages: 1 });
  });

  it('paginates server-side', async () => {
    for (let i = 0; i < 11; i += 1) {
      await createPatientViaApi({ firstName: `Bulk${i}`, phone: `555-04${String(i).padStart(2, '0')}` });
    }

    const page1 = await asAdmin(request(app).get('/api/patients').query({ page: 1, limit: 10 })).expect(200);
    const page2 = await asAdmin(request(app).get('/api/patients').query({ page: 2, limit: 10 })).expect(200);

    expect(page1.body.data.patients).toHaveLength(10);
    expect(page2.body.data.patients).toHaveLength(3);
    expect(page1.body.data.pagination.totalPages).toBe(2);
    expect(page1.body.data.pagination.total).toBe(13);
  });

  it('searches case-insensitively by name, patient ID, phone, email, and national ID', async () => {
    const byName = await asAdmin(request(app).get('/api/patients').query({ search: 'SARA' })).expect(200);
    expect(byName.body.data.patients).toHaveLength(1);

    const byPatientId = await asAdmin(request(app).get('/api/patients').query({ search: 'pat-000001' })).expect(200);
    expect(byPatientId.body.data.patients).toHaveLength(1);
    expect((byPatientId.body.data.patients as PatientJson[])[0]!.firstName).toBe('John');

    const byPhone = await asAdmin(request(app).get('/api/patients').query({ search: '555-0333' })).expect(200);
    expect(byPhone.body.data.patients).toHaveLength(1);

    const byEmail = await asAdmin(request(app).get('/api/patients').query({ search: 'sara.n@' })).expect(200);
    expect(byEmail.body.data.patients).toHaveLength(1);

    const byNationalId = await asAdmin(request(app).get('/api/patients').query({ search: 'NID-990022' })).expect(200);
    expect(byNationalId.body.data.patients).toHaveLength(1);

    const noMatch = await asAdmin(request(app).get('/api/patients').query({ search: 'zzz-nope' })).expect(200);
    expect(noMatch.body.data.patients).toHaveLength(0);
  });

  it('does not treat regex metacharacters in search as patterns', async () => {
    const res = await asAdmin(request(app).get('/api/patients').query({ search: '.*' })).expect(200);
    expect(res.body.data.patients).toHaveLength(0);
  });

  it('filters by gender, blood group, and status — individually and combined', async () => {
    const female = await asAdmin(request(app).get('/api/patients').query({ gender: 'female' })).expect(200);
    expect(female.body.data.patients).toHaveLength(1);

    const abNeg = await asAdmin(request(app).get('/api/patients').query({ bloodGroup: 'AB-' })).expect(200);
    expect(abNeg.body.data.patients).toHaveLength(1);

    const combined = await asAdmin(
      request(app).get('/api/patients').query({ gender: 'female', bloodGroup: 'O+' })
    ).expect(200);
    expect(combined.body.data.patients).toHaveLength(0);

    const patients = await Patient.find({ firstName: 'John' });
    await asAdmin(request(app).patch(`/api/patients/${patients[0]!._id}/status`))
      .send({ status: 'inactive' })
      .expect(200);

    const inactive = await asAdmin(request(app).get('/api/patients').query({ status: 'inactive' })).expect(200);
    expect(inactive.body.data.patients).toHaveLength(1);
    const active = await asAdmin(request(app).get('/api/patients').query({ status: 'active' })).expect(200);
    expect(active.body.data.patients).toHaveLength(1);
  });
});

describe('GET /api/patients/:id', () => {
  it('fetches a patient profile', async () => {
    const created = await createPatientViaApi();
    const res = await asAdmin(request(app).get(`/api/patients/${created._id}`)).expect(200);
    const patient = res.body.data.patient as PatientJson;
    expect(patient.patientId).toBe('PAT-000001');
    expect(patient.allergies).toEqual(['Penicillin']);
  });

  it('returns 400 for a malformed id and 404 for a missing id', async () => {
    await asAdmin(request(app).get('/api/patients/not-an-id')).expect(400);
    await asAdmin(request(app).get('/api/patients/64b000000000000000000000')).expect(404);
  });
});

describe('PATCH /api/patients/:id', () => {
  it('updates profile fields and medical history', async () => {
    const created = await createPatientViaApi();

    const res = await asAdmin(request(app).patch(`/api/patients/${created._id}`))
      .send({
        phone: '555-0777',
        allergies: ['Penicillin', 'Peanuts'],
        medicalHistory: ['Hypertension', 'Appendectomy 2014', 'Diabetes'],
      })
      .expect(200);

    const patient = res.body.data.patient as PatientJson;
    expect(patient.phone).toBe('555-0777');
    expect(patient.allergies).toEqual(['Penicillin', 'Peanuts']);
    expect(patient.medicalHistory).toHaveLength(3);
  });

  it('never changes the generated patientId, status, or creator', async () => {
    const created = await createPatientViaApi();

    const res = await asAdmin(request(app).patch(`/api/patients/${created._id}`))
      .send({ patientId: 'PAT-999999', status: 'inactive', createdBy: '64b000000000000000000000', firstName: 'Johnny' })
      .expect(200);

    const patient = res.body.data.patient as PatientJson;
    expect(patient.patientId).toBe('PAT-000001');
    expect(patient.status).toBe('active');
    expect(patient.firstName).toBe('Johnny');
    expect(patient.createdBy?.firstName).toBe('Test');
  });

  it('validates updates with 400', async () => {
    const created = await createPatientViaApi();
    await asAdmin(request(app).patch(`/api/patients/${created._id}`))
      .send({ dateOfBirth: '2999-01-01' })
      .expect(400);
    await asAdmin(request(app).patch(`/api/patients/${created._id}`))
      .send({ gender: 'invalid' })
      .expect(400);
  });
});

describe('PATCH /api/patients/:id/status', () => {
  it('soft-deactivates and reactivates; the record is never deleted', async () => {
    const created = await createPatientViaApi();

    await asAdmin(request(app).patch(`/api/patients/${created._id}/status`))
      .send({ status: 'inactive' })
      .expect(200);

    // Still in the database and still viewable.
    const res = await asAdmin(request(app).get(`/api/patients/${created._id}`)).expect(200);
    expect((res.body.data.patient as PatientJson).status).toBe('inactive');
    expect(await Patient.countDocuments({})).toBe(1);

    await asAdmin(request(app).patch(`/api/patients/${created._id}/status`))
      .send({ status: 'active' })
      .expect(200);
  });

  it('rejects an invalid status with 400', async () => {
    const created = await createPatientViaApi();
    await asAdmin(request(app).patch(`/api/patients/${created._id}/status`))
      .send({ status: 'deleted' })
      .expect(400);
  });
});

describe('GET /api/patients/stats', () => {
  it('returns real database counts', async () => {
    const a = await createPatientViaApi();
    await createPatientViaApi({ phone: '555-0501' });
    await createPatientViaApi({ phone: '555-0502' });
    await asAdmin(request(app).patch(`/api/patients/${a._id}/status`))
      .send({ status: 'inactive' })
      .expect(200);

    const res = await asAdmin(request(app).get('/api/patients/stats')).expect(200);

    expect(res.body.data).toEqual({
      totalPatients: 3,
      activePatients: 2,
      inactivePatients: 1,
      newPatientsThisMonth: 3,
    });
  });

  it('is available to receptionists', async () => {
    const token = await tokenFor('receptionist');
    await request(app)
      .get('/api/patients/stats')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
});

describe('patient role permissions', () => {
  it('rejects unauthenticated access with 401', async () => {
    await request(app).get('/api/patients').expect(401);
    await request(app).post('/api/patients').send(VALID_PATIENT).expect(401);
    await request(app).get('/api/patients/stats').expect(401);
  });

  it.each(['doctor', 'nurse'] as const)('%s can view and search but not modify', async (role) => {
    const created = await createPatientViaApi();
    const token = await tokenFor(role);
    const bearer = (req: SupertestTest): SupertestTest =>
      req.set('Authorization', `Bearer ${token}`);

    // Can view, search, and filter
    await bearer(request(app).get('/api/patients')).expect(200);
    await bearer(request(app).get('/api/patients').query({ search: 'john' })).expect(200);
    await bearer(request(app).get('/api/patients').query({ gender: 'male' })).expect(200);
    await bearer(request(app).get(`/api/patients/${created._id}`)).expect(200);

    // Cannot create, edit, change status, or read stats
    await bearer(request(app).post('/api/patients')).send(VALID_PATIENT).expect(403);
    await bearer(request(app).patch(`/api/patients/${created._id}`))
      .send({ firstName: 'Nope' })
      .expect(403);
    await bearer(request(app).patch(`/api/patients/${created._id}/status`))
      .send({ status: 'inactive' })
      .expect(403);
    await bearer(request(app).get('/api/patients/stats')).expect(403);
  });

  it('receptionist can create and edit but not change status', async () => {
    const created = await createPatientViaApi();
    const token = await tokenFor('receptionist');
    const bearer = (req: SupertestTest): SupertestTest =>
      req.set('Authorization', `Bearer ${token}`);

    await bearer(request(app).patch(`/api/patients/${created._id}`))
      .send({ occupation: 'Teacher' })
      .expect(200);

    await bearer(request(app).patch(`/api/patients/${created._id}/status`))
      .send({ status: 'inactive' })
      .expect(403);
  });

  it('admin has full access including status changes', async () => {
    const created = await createPatientViaApi();

    await asAdmin(request(app).patch(`/api/patients/${created._id}`))
      .send({ occupation: 'Pilot' })
      .expect(200);
    await asAdmin(request(app).patch(`/api/patients/${created._id}/status`))
      .send({ status: 'inactive' })
      .expect(200);
    await asAdmin(request(app).get('/api/patients/stats')).expect(200);
  });
});
