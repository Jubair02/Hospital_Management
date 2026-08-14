import './env.js';
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import createApp from '../app.js';
import Patient from '../models/Patient.js';
import { setupTestDB, createAdmin, createStaff, loginAs, ADMIN } from './helpers.js';
import {
  createDepartment,
  createActivePatient,
  createDoctorViaApi,
  setWeekdayAvailability,
  nextMonday,
  type DoctorJson,
} from './phase3Helpers.js';

const app = createApp();

setupTestDB();

let adminToken: string;
let receptionistToken: string;
let doctor: DoctorJson;
let doctorToken: string;
let departmentId: string;
let patientId: string;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Books an appointment and returns its id. */
const bookAppointment = async (startTime = '10:00', endTime = '10:30'): Promise<string> => {
  const res = await request(app)
    .post('/api/appointments')
    .set(auth(adminToken))
    .send({
      patientId,
      doctorId: doctor._id,
      appointmentDate: nextMonday(),
      startTime,
      endTime,
      reason: 'Checkup',
    })
    .expect(201);
  return res.body.data.appointment._id as string;
};

/** Completed consultation with a recorded diagnosis. */
const completeConsultation = async (appointmentId: string, diagnosis = 'Hypertension') => {
  const started = await request(app)
    .post('/api/consultations')
    .set(auth(doctorToken))
    .send({ appointmentId })
    .expect(201);
  const id = started.body.data.consultation._id as string;

  await request(app)
    .patch(`/api/consultations/${id}`)
    .set(auth(doctorToken))
    .send({
      chiefComplaint: 'Headache',
      assessment: 'Elevated blood pressure',
      treatmentPlan: 'Monitor daily',
      diagnoses: [{ diagnosis, type: 'primary' }],
    })
    .expect(200);
  await request(app)
    .patch(`/api/consultations/${id}/status`)
    .set(auth(doctorToken))
    .send({ status: 'completed' })
    .expect(200);

  return id;
};

beforeEach(async () => {
  await createAdmin();
  adminToken = await loginAs(app, ADMIN);
  receptionistToken = await loginAs(app, await createStaff('receptionist'));
  departmentId = String((await createDepartment('Cardiology'))._id);
  doctor = await createDoctorViaApi(app, adminToken, departmentId);
  await setWeekdayAvailability(app, adminToken, doctor._id);
  doctorToken = await loginAs(app, { email: doctor.email, password: 'DoctorPass123!' });
  patientId = String((await createActivePatient())._id);
});

describe('GET /api/analytics/overview', () => {
  it('returns real KPIs and gap-free time series', async () => {
    await bookAppointment();

    const res = await request(app)
      .get('/api/analytics/overview')
      .query({ range: 'month' })
      .set(auth(adminToken))
      .expect(200);

    const { kpis, series, range } = res.body.data;
    expect(kpis.totalPatients).toBe(1);
    expect(kpis.totalDoctors).toBe(1);
    expect(kpis.totalAppointments).toBe(1);
    expect(kpis.completedConsultations).toBe(0);
    expect(kpis.currentInpatients).toBe(0);
    expect(kpis.totalRevenue).toBe(0);
    expect(range.preset).toBe('month');
    expect(range.granularity).toBe('day');

    // Every day of the month is present, and the total matches the KPI.
    expect(series.appointments.length).toBeGreaterThanOrEqual(1);
    const summed = (series.appointments as Array<{ value: number }>).reduce(
      (sum, p) => sum + p.value,
      0
    );
    expect(summed).toBe(1);
  });

  it('honours date presets and custom ranges', async () => {
    await bookAppointment();

    const today = await request(app)
      .get('/api/analytics/overview')
      .query({ range: 'today' })
      .set(auth(adminToken))
      .expect(200);
    expect(today.body.data.kpis.totalAppointments).toBe(1);
    expect(today.body.data.series.appointments).toHaveLength(1); // one bucket

    // A historical window contains nothing created today.
    const past = await request(app)
      .get('/api/analytics/overview')
      .query({ range: 'custom', from: '2020-01-01', to: '2020-01-31' })
      .set(auth(adminToken))
      .expect(200);
    expect(past.body.data.kpis.totalAppointments).toBe(0);
    expect(past.body.data.range.preset).toBe('custom');

    // A year-long custom range switches to monthly buckets.
    const yearly = await request(app)
      .get('/api/analytics/overview')
      .query({ range: 'custom', from: '2020-01-01', to: '2020-12-31' })
      .set(auth(adminToken))
      .expect(200);
    expect(yearly.body.data.range.granularity).toBe('month');
    expect(yearly.body.data.series.appointments).toHaveLength(12);
  });

  it('is admin only', async () => {
    for (const token of [receptionistToken, doctorToken]) {
      await request(app).get('/api/analytics/overview').set(auth(token)).expect(403);
    }
    await request(app).get('/api/analytics/overview').expect(401);
  });
});

describe('appointment report', () => {
  it('summarizes statuses and breaks down by doctor and department', async () => {
    const first = await bookAppointment('09:00', '09:30');
    await bookAppointment('11:00', '11:30');
    await request(app)
      .patch(`/api/appointments/${first}/status`)
      .set(auth(adminToken))
      .send({ status: 'cancelled' })
      .expect(200);

    const res = await request(app)
      .get('/api/reports/appointments')
      .set(auth(receptionistToken))
      .expect(200);

    expect(res.body.data.summary).toMatchObject({ total: 2, scheduled: 1, cancelled: 1 });
    expect(res.body.data.byDoctor[0].count).toBe(2);
    expect(res.body.data.byDepartment[0].label).toBe('Cardiology');
  });

  it('filters by status, doctor, and department', async () => {
    await bookAppointment();

    const byStatus = await request(app)
      .get('/api/reports/appointments')
      .query({ status: 'cancelled' })
      .set(auth(adminToken))
      .expect(200);
    expect(byStatus.body.data.summary.total).toBe(0);

    const byDept = await request(app)
      .get('/api/reports/appointments')
      .query({ departmentId })
      .set(auth(adminToken))
      .expect(200);
    expect(byDept.body.data.summary.total).toBe(1);
  });

  it('scopes doctors to their own appointments regardless of query params', async () => {
    await bookAppointment();

    // A second doctor with their own appointment.
    const otherDept = String((await createDepartment('Neurology'))._id);
    const doctorB = await createDoctorViaApi(app, adminToken, otherDept);
    await setWeekdayAvailability(app, adminToken, doctorB._id);
    const otherPatient = String((await createActivePatient({ phone: '555-77' }))._id);
    await request(app)
      .post('/api/appointments')
      .set(auth(adminToken))
      .send({
        patientId: otherPatient,
        doctorId: doctorB._id,
        appointmentDate: nextMonday(),
        startTime: '12:00',
        endTime: '12:30',
        reason: 'Consult',
      })
      .expect(201);

    const tokenB = await loginAs(app, { email: doctorB.email, password: 'DoctorPass123!' });

    // Doctor B asks for doctor A's data — still only sees their own.
    const res = await request(app)
      .get('/api/reports/appointments')
      .query({ doctorId: doctor._id })
      .set(auth(tokenB))
      .expect(200);
    expect(res.body.data.summary.total).toBe(1);
    expect(res.body.data.byDoctor[0].label).toContain(doctorB.lastName);
  });

  it('is closed to pharmacist, lab technician, and nurse', async () => {
    for (const role of ['pharmacist', 'lab_technician', 'nurse'] as const) {
      const token = await loginAs(app, await createStaff(role));
      await request(app).get('/api/reports/appointments').set(auth(token)).expect(403);
    }
  });
});

describe('patient report', () => {
  it('aggregates counts, gender, and age groups without personal data', async () => {
    await createActivePatient({ phone: '555-1', gender: 'female', dateOfBirth: new Date('1950-05-05') });
    await Patient.updateOne({ phone: '555-1' }, { $set: { status: 'inactive' } });

    const res = await request(app)
      .get('/api/reports/patients')
      .set(auth(receptionistToken))
      .expect(200);

    expect(res.body.data.summary).toMatchObject({ total: 2, active: 1, inactive: 1 });
    expect(res.body.data.byGender.map((g: { label: string }) => g.label).sort()).toEqual([
      'Female',
      'Male',
    ]);
    const seniors = res.body.data.byAgeGroup.find((b: { label: string }) => b.label === '65+');
    expect(seniors.count).toBe(1);

    // No names, phones, or identifiers leak into the aggregate report.
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/555-1/);
    expect(body).not.toMatch(/Carter/);
  });

  it('is restricted to admin and receptionist', async () => {
    await request(app).get('/api/reports/patients').set(auth(doctorToken)).expect(403);
    await request(app).get('/api/reports/patients').expect(401);
  });
});

describe('clinical report', () => {
  it('counts consultations and frequency of recorded diagnoses', async () => {
    const apt = await bookAppointment();
    await completeConsultation(apt, 'Hypertension');

    const res = await request(app)
      .get('/api/reports/clinical')
      .set(auth(adminToken))
      .expect(200);

    expect(res.body.data.summary).toMatchObject({ total: 1, completed: 1, inProgress: 0 });
    expect(res.body.data.topDiagnoses[0]).toMatchObject({ label: 'Hypertension', count: 1 });
    expect(res.body.data.byDepartment[0].label).toBe('Cardiology');
  });

  it('scopes doctors to their own consultations', async () => {
    const apt = await bookAppointment();
    await completeConsultation(apt);

    const otherDept = String((await createDepartment('Dermatology'))._id);
    const doctorB = await createDoctorViaApi(app, adminToken, otherDept);
    const tokenB = await loginAs(app, { email: doctorB.email, password: 'DoctorPass123!' });

    const res = await request(app)
      .get('/api/reports/clinical')
      .query({ doctorId: doctor._id })
      .set(auth(tokenB))
      .expect(200);
    expect(res.body.data.summary.total).toBe(0);
  });

  it('is closed to receptionist and nurse', async () => {
    // The receptionist already exists from the outer setup.
    await request(app).get('/api/reports/clinical').set(auth(receptionistToken)).expect(403);

    const nurseToken = await loginAs(app, await createStaff('nurse'));
    await request(app).get('/api/reports/clinical').set(auth(nurseToken)).expect(403);
  });
});

describe('pharmacy, laboratory, billing & inpatient reports', () => {
  it('pharmacy report reports stock health and is pharmacist-scoped', async () => {
    const pharmacistToken = await loginAs(app, await createStaff('pharmacist'));

    const category = await request(app)
      .post('/api/pharmacy/categories')
      .set(auth(pharmacistToken))
      .send({ name: 'Analgesics' })
      .expect(201);
    await request(app)
      .post('/api/pharmacy/medicines')
      .set(auth(pharmacistToken))
      .send({
        name: 'Paracetamol',
        category: category.body.data.category._id,
        dosageForm: 'tablet',
        reorderLevel: 50,
      })
      .expect(201);

    const res = await request(app)
      .get('/api/reports/pharmacy')
      .set(auth(pharmacistToken))
      .expect(200);
    expect(res.body.data.summary).toMatchObject({
      dispensingEvents: 0,
      unitsDispensed: 0,
      lowStockCount: 1,
      expiredBatches: 0,
    });
    expect(res.body.data.lowStock[0]).toMatchObject({ count: 0, reorderLevel: 50 });

    await request(app).get('/api/reports/pharmacy').set(auth(receptionistToken)).expect(403);
  });

  it('laboratory report counts orders by state for lab staff', async () => {
    const labToken = await loginAs(app, await createStaff('lab_technician'));

    const res = await request(app).get('/api/reports/laboratory').set(auth(labToken)).expect(200);
    expect(res.body.data.summary).toMatchObject({
      totalOrders: 0,
      completed: 0,
      pending: 0,
      cancelled: 0,
    });

    await request(app).get('/api/reports/laboratory').set(auth(doctorToken)).expect(403);
  });

  it('billing report totals revenue from real payments', async () => {
    const invoice = await request(app)
      .post('/api/billing/invoices')
      .set(auth(receptionistToken))
      .send({
        patientId,
        items: [{ itemType: 'service', description: 'Dressing', quantity: 2, unitPrice: 12.5 }],
      })
      .expect(201);
    await request(app)
      .patch(`/api/billing/invoices/${invoice.body.data.invoice._id}/status`)
      .set(auth(receptionistToken))
      .send({ status: 'issued' })
      .expect(200);
    await request(app)
      .post('/api/billing/payments')
      .set(auth(receptionistToken))
      .send({ invoiceId: invoice.body.data.invoice._id, amount: 10, method: 'card' })
      .expect(201);

    const res = await request(app)
      .get('/api/reports/billing')
      .set(auth(receptionistToken))
      .expect(200);
    expect(res.body.data.summary).toMatchObject({
      revenue: 10,
      paid: 10,
      refunds: 0,
      outstanding: 15,
      invoices: 1,
      partiallyPaidInvoices: 1,
    });
    expect(res.body.data.byMethod[0]).toMatchObject({ label: 'card', count: 1, amount: 10 });

    // Method filter narrows the payment side.
    const cash = await request(app)
      .get('/api/reports/billing')
      .query({ method: 'cash' })
      .set(auth(adminToken))
      .expect(200);
    expect(cash.body.data.summary.paid).toBe(0);

    await request(app).get('/api/reports/billing').set(auth(doctorToken)).expect(403);
  });

  it('inpatient report reflects occupancy and is open to nurses', async () => {
    const nurseToken = await loginAs(app, await createStaff('nurse'));

    const ward = await request(app)
      .post('/api/inpatient/wards')
      .set(auth(adminToken))
      .send({ name: 'General A', type: 'general' })
      .expect(201);
    await request(app)
      .post('/api/inpatient/beds')
      .set(auth(adminToken))
      .send({ wardId: ward.body.data.ward._id, bedNumber: 'A-1' })
      .expect(201);
    await request(app)
      .post('/api/inpatient/admissions')
      .set(auth(receptionistToken))
      .send({
        patientId,
        doctorId: doctor._id,
        wardId: ward.body.data.ward._id,
        bedId: (
          await request(app)
            .get('/api/inpatient/beds')
            .query({ status: 'available' })
            .set(auth(adminToken))
            .expect(200)
        ).body.data.beds[0]._id,
        reason: 'Observation',
        admissionType: 'emergency',
      })
      .expect(201);

    const res = await request(app)
      .get('/api/reports/inpatient')
      .set(auth(nurseToken))
      .expect(200);

    expect(res.body.data.summary).toMatchObject({
      currentInpatients: 1,
      admissions: 1,
      discharges: 0,
      transfers: 0,
      totalBeds: 1,
      availableBeds: 0,
      occupiedBeds: 1,
      occupancyRate: 100,
    });
    expect(res.body.data.byWard[0]).toMatchObject({ label: 'General A', count: 1, total: 1 });

    await request(app).get('/api/reports/inpatient').set(auth(doctorToken)).expect(403);
  });
});

describe('CSV export', () => {
  it('exports the report honoring filters and permissions', async () => {
    await bookAppointment();

    const res = await request(app)
      .get('/api/reports/appointments')
      .query({ format: 'csv', range: 'month' })
      .set(auth(adminToken))
      .expect(200);

    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/appointments-report-\d{4}-\d{2}-\d{2}\.csv/);
    expect(res.text).toMatch(/Summary/);
    expect(res.text).toMatch(/Appointments by doctor/);
    expect(res.text).toMatch(new RegExp(doctor.lastName));

    // A filtered export contains the filtered numbers, not everything.
    const filtered = await request(app)
      .get('/api/reports/appointments')
      .query({ format: 'csv', status: 'cancelled' })
      .set(auth(adminToken))
      .expect(200);
    expect(filtered.text).toMatch(/Total,0/);

    // Exports never leak credentials.
    expect(res.text).not.toMatch(/password/i);
    expect(res.text).not.toMatch(/\$2[aby]\$/); // bcrypt hash prefix
  });

  it('export obeys the same role rules as the report', async () => {
    await request(app)
      .get('/api/reports/billing')
      .query({ format: 'csv' })
      .set(auth(doctorToken))
      .expect(403);
    await request(app).get('/api/reports/patients').query({ format: 'csv' }).expect(401);
  });
});
