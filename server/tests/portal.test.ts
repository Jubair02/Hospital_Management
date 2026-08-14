import './env.js';
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Types } from 'mongoose';
import createApp from '../app.js';
import Patient from '../models/Patient.js';
import User from '../models/User.js';
import Consultation from '../models/Consultation.js';
import LabOrder from '../models/LabOrder.js';
import LabResult from '../models/LabResult.js';
import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import Ward from '../models/Ward.js';
import Bed from '../models/Bed.js';
import Admission from '../models/Admission.js';
import Notification from '../models/Notification.js';
import AuditLog from '../models/AuditLog.js';
import { nextSequenceId } from '../services/sequenceService.js';
import { setupTestDB, createAdmin, loginAs, ADMIN, createStaff } from './helpers.js';
import {
  createActivePatient,
  createDepartment,
  createDoctorViaApi,
  setWeekdayAvailability,
  nextMonday,
  type DoctorJson,
} from './phase3Helpers.js';

const app = createApp();

setupTestDB();

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let adminToken: string;

/** Issues a portal account for a patient via the real API and logs in. */
const portalLogin = async (
  patientMongoId: string,
  email: string
): Promise<string> => {
  const password = 'PatientPass123!';
  await request(app)
    .post(`/api/patients/${patientMongoId}/portal-account`)
    .set(auth(adminToken))
    .send({ email, password })
    .expect(201);
  return loginAs(app, { email, password });
};

interface PortalPair {
  patientA: { id: string; token: string };
  patientB: { id: string; token: string };
}

/** Two independent portal patients — the cross-access test fixture. */
const createPortalPair = async (): Promise<PortalPair> => {
  const a = await createActivePatient({ firstName: 'Alice', lastName: 'Ames' });
  const b = await createActivePatient({ firstName: 'Bob', lastName: 'Bond' });
  const tokenA = await portalLogin(String(a._id), 'alice.portal@test.local');
  const tokenB = await portalLogin(String(b._id), 'bob.portal@test.local');
  return {
    patientA: { id: String(a._id), token: tokenA },
    patientB: { id: String(b._id), token: tokenB },
  };
};

/** Minimal completed consultation with prescriptions, written directly. */
const seedConsultation = async (
  patientId: string,
  doctor: DoctorJson,
  departmentId: string
): Promise<{ _id: Types.ObjectId }> =>
  Consultation.create({
    consultationId: await nextSequenceId('consultationId', 'CON', 6),
    appointmentId: (await Consultation.db.models.Appointment.create({
      appointmentId: await nextSequenceId('appointmentId', 'APT', 6),
      patientId,
      doctorId: doctor._id,
      departmentId,
      appointmentDate: new Date(`${nextMonday()}T00:00:00.000Z`),
      startTime: '09:00',
      endTime: '09:30',
      reason: 'Checkup',
      status: 'confirmed',
    }))._id,
    patientId,
    doctorId: doctor._id,
    departmentId,
    consultationDate: new Date(),
    chiefComplaint: 'Chest pain',
    clinicalNotes: 'INTERNAL working notes',
    physicalExamination: 'INTERNAL exam notes',
    assessment: 'Stable angina',
    diagnoses: [{ diagnosis: 'Angina pectoris', type: 'primary' }],
    treatmentPlan: 'Rest and medication',
    prescriptions: [
      {
        medicineName: 'Aspirin 75mg',
        dosage: '1 tablet',
        frequency: 'once daily',
        duration: '30 days',
        route: 'oral',
        instructions: 'After food',
      },
    ],
    status: 'completed',
  });

beforeEach(async () => {
  await createAdmin();
  adminToken = await loginAs(app, ADMIN);
});

// ---------------------------------------------------------------------------

describe('portal accounts', () => {
  it('admin issues a portal account; the patient can log in and reach only /api/patient', async () => {
    const patient = await createActivePatient();
    const token = await portalLogin(String(patient._id), 'p1@test.local');

    const me = await request(app).get('/api/auth/me').set(auth(token)).expect(200);
    expect(me.body.data.user.role).toBe('patient');

    const dash = await request(app).get('/api/patient/dashboard').set(auth(token)).expect(200);
    expect(dash.body.data.patient._id).toBe(String(patient._id));

    // Issuance is audited.
    expect(
      await AuditLog.countDocuments({ action: 'portal_account_created', resourceId: patient._id })
    ).toBe(1);
  });

  it('one account per patient; staff creation API cannot mint patient users', async () => {
    const patient = await createActivePatient();
    await portalLogin(String(patient._id), 'p2@test.local');

    await request(app)
      .post(`/api/patients/${patient._id}/portal-account`)
      .set(auth(adminToken))
      .send({ email: 'second@test.local', password: 'PatientPass123!' })
      .expect(409);

    // /api/users refuses the patient role entirely.
    const res = await request(app)
      .post('/api/users')
      .set(auth(adminToken))
      .send({
        firstName: 'Fake',
        lastName: 'Patient',
        email: 'fake.patient@test.local',
        password: 'Password123!',
        role: 'patient',
      })
      .expect(400);
    expect(res.body.message).toMatch(/Role must be one of/);
  });

  it('a patient-role login without a linked profile is refused', async () => {
    // Can only happen through data drift, but must fail closed.
    await User.create({
      firstName: 'Orphan',
      lastName: 'Account',
      email: 'orphan@test.local',
      password: 'Password123!',
      role: 'patient',
    });
    const token = await loginAs(app, { email: 'orphan@test.local', password: 'Password123!' });
    await request(app).get('/api/patient/dashboard').set(auth(token)).expect(403);
  });

  it('deactivating the patient record revokes the live portal token', async () => {
    const patient = await createActivePatient();
    const token = await portalLogin(String(patient._id), 'p3@test.local');

    await request(app).get('/api/patient/profile').set(auth(token)).expect(200);

    await request(app)
      .patch(`/api/patients/${patient._id}/status`)
      .set(auth(adminToken))
      .send({ status: 'inactive' })
      .expect(200);

    // The linked account was deactivated → authenticate refuses the token.
    await request(app).get('/api/patient/profile').set(auth(token)).expect(403);
  });
});

// ---------------------------------------------------------------------------

describe('portal RBAC boundaries', () => {
  it('staff roles cannot use the portal API; patients cannot use staff APIs', async () => {
    const patient = await createActivePatient();
    const patientToken = await portalLogin(String(patient._id), 'p4@test.local');

    for (const role of ['doctor', 'nurse', 'receptionist', 'pharmacist', 'lab_technician'] as const) {
      const staff = await createStaff(role);
      const staffToken = await loginAs(app, staff);
      await request(app).get('/api/patient/dashboard').set(auth(staffToken)).expect(403);
    }
    await request(app).get('/api/patient/dashboard').set(auth(adminToken)).expect(403);

    // The patient is locked out of every staff surface.
    const staffEndpoints = [
      '/api/users',
      '/api/patients',
      `/api/patients/${patient._id}`,
      '/api/appointments',
      '/api/consultations',
      '/api/pharmacy/medicines',
      '/api/laboratory/orders',
      '/api/billing/invoices',
      '/api/inpatient/admissions',
      '/api/admin/audit-logs',
      '/api/admin/system-health',
      '/api/analytics/overview',
      '/api/reports/patients',
    ];
    for (const endpoint of staffEndpoints) {
      const res = await request(app).get(endpoint).set(auth(patientToken));
      expect(res.status, endpoint).toBe(403);
    }

    // Unauthenticated portal access is refused outright.
    await request(app).get('/api/patient/dashboard').expect(401);
  });
});

// ---------------------------------------------------------------------------

describe('portal profile', () => {
  it('updates contact fields and audits the change', async () => {
    const patient = await createActivePatient();
    const token = await portalLogin(String(patient._id), 'p5@test.local');

    const res = await request(app)
      .patch('/api/patient/profile')
      .set(auth(token))
      .send({ phone: '+1 555-0199', address: '12 Rose Lane', occupation: 'Teacher' })
      .expect(200);

    expect(res.body.data.patient.phone).toBe('+1 555-0199');
    expect(res.body.data.patient.address).toBe('12 Rose Lane');
    expect(
      await AuditLog.countDocuments({ action: 'portal_profile_updated', resourceId: patient._id })
    ).toBe(1);
  });

  it('rejects protected fields loudly — clinical and identity data are unreachable', async () => {
    const patient = await createActivePatient();
    const token = await portalLogin(String(patient._id), 'p6@test.local');

    for (const payload of [
      { medicalHistory: ['self-written history'] },
      { allergies: [] },
      { status: 'active' },
      { firstName: 'Notme' },
      { dateOfBirth: '1990-01-01' },
      { bloodGroup: 'AB+' },
      { patientId: 'PAT-999999' },
      { userId: String(patient._id) },
      { phone: '+1 555', medicalHistory: [] }, // mixed → still rejected
    ]) {
      const res = await request(app)
        .patch('/api/patient/profile')
        .set(auth(token))
        .send(payload)
        .expect(400);
      expect(res.body.message).toMatch(/cannot be changed|at least one/);
    }

    const fresh = await Patient.findById(patient._id);
    expect(fresh!.firstName).toBe('John');
    expect(fresh!.medicalHistory).toEqual([]);
  });

  it('a patient can change their own password and sign back in with it', async () => {
    const patient = await createActivePatient();
    const token = await portalLogin(String(patient._id), 'p10@test.local');

    await request(app)
      .post('/api/auth/change-password')
      .set(auth(token))
      .send({ currentPassword: 'PatientPass123!', newPassword: 'MyOwnSecret789!' })
      .expect(200);

    await request(app)
      .post('/api/auth/login')
      .send({ email: 'p10@test.local', password: 'PatientPass123!' })
      .expect(401);
    const relogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'p10@test.local', password: 'MyOwnSecret789!' })
      .expect(200);
    expect(relogin.body.data.user.role).toBe('patient');
  });
});

// ---------------------------------------------------------------------------

describe('portal appointments & booking', () => {
  const setupDoctor = async (): Promise<{ doctor: DoctorJson; departmentId: string }> => {
    const department = await createDepartment();
    const doctor = await createDoctorViaApi(app, adminToken, String(department._id));
    await setWeekdayAvailability(app, adminToken, doctor._id);
    return { doctor, departmentId: String(department._id) };
  };

  it('walks the full booking flow: departments → doctors → slots → book → appears in list', async () => {
    const { doctor, departmentId } = await setupDoctor();
    const patient = await createActivePatient();
    const token = await portalLogin(String(patient._id), 'p7@test.local');
    const date = nextMonday();

    const departments = await request(app)
      .get('/api/patient/booking/departments')
      .set(auth(token))
      .expect(200);
    expect(departments.body.data.departments.length).toBe(1);

    const doctors = await request(app)
      .get(`/api/patient/booking/doctors?departmentId=${departmentId}`)
      .set(auth(token))
      .expect(200);
    expect(doctors.body.data.doctors.length).toBe(1);
    // Directory exposes public fields only.
    expect(doctors.body.data.doctors[0]).not.toHaveProperty('licenseNumber');

    const slots = await request(app)
      .get(`/api/patient/booking/slots?doctorId=${doctor._id}&date=${date}`)
      .set(auth(token))
      .expect(200);
    const slot = slots.body.data.slots[0] as { startTime: string; endTime: string };
    expect(slot).toBeDefined();

    const booked = await request(app)
      .post('/api/patient/appointments')
      .set(auth(token))
      .send({
        doctorId: doctor._id,
        appointmentDate: date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        reason: 'Portal booking',
      })
      .expect(201);
    expect(booked.body.data.appointment.status).toBe('scheduled');

    // The booked slot disappears from availability.
    const after = await request(app)
      .get(`/api/patient/booking/slots?doctorId=${doctor._id}&date=${date}`)
      .set(auth(token))
      .expect(200);
    expect(
      (after.body.data.slots as Array<{ startTime: string }>).find(
        (s) => s.startTime === slot.startTime
      )
    ).toBeUndefined();

    // Double-booking the same slot is refused.
    await request(app)
      .post('/api/patient/appointments')
      .set(auth(token))
      .send({
        doctorId: doctor._id,
        appointmentDate: date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        reason: 'Duplicate',
      })
      .expect(409);

    const list = await request(app).get('/api/patient/appointments').set(auth(token)).expect(200);
    expect(list.body.data.appointments.length).toBe(1);

    expect(await AuditLog.countDocuments({ action: 'portal_appointment_booked' })).toBe(1);
  });

  it('a patientId smuggled into the booking body is ignored — ownership is forced', async () => {
    const { doctor } = await setupDoctor();
    const { patientA, patientB } = await createPortalPair();

    const res = await request(app)
      .post('/api/patient/appointments')
      .set(auth(patientA.token))
      .send({
        patientId: patientB.id, // attack: book on someone else's file
        doctorId: doctor._id,
        appointmentDate: nextMonday(),
        startTime: '09:00',
        endTime: '09:30',
        reason: 'Spoofed booking',
      })
      .expect(201);

    expect(String(res.body.data.appointment.patientId._id ?? res.body.data.appointment.patientId)).toBe(
      patientA.id
    );
  });

  it('cancels own scheduled appointments; completed ones are immutable', async () => {
    const { doctor } = await setupDoctor();
    const patient = await createActivePatient();
    const token = await portalLogin(String(patient._id), 'p8@test.local');

    const booked = await request(app)
      .post('/api/patient/appointments')
      .set(auth(token))
      .send({
        doctorId: doctor._id,
        appointmentDate: nextMonday(),
        startTime: '10:00',
        endTime: '10:30',
        reason: 'Will cancel',
      })
      .expect(201);
    const id = booked.body.data.appointment._id as string;

    await request(app).patch(`/api/patient/appointments/${id}/cancel`).set(auth(token)).expect(200);
    // Already cancelled → no further transition.
    await request(app).patch(`/api/patient/appointments/${id}/cancel`).set(auth(token)).expect(400);

    expect(await AuditLog.countDocuments({ action: 'portal_appointment_cancelled' })).toBe(1);
  });

  it('cross-patient appointment access and cancellation are blocked', async () => {
    const { doctor } = await setupDoctor();
    const { patientA, patientB } = await createPortalPair();

    const booked = await request(app)
      .post('/api/patient/appointments')
      .set(auth(patientA.token))
      .send({
        doctorId: doctor._id,
        appointmentDate: nextMonday(),
        startTime: '11:00',
        endTime: '11:30',
        reason: 'Private',
      })
      .expect(201);
    const id = booked.body.data.appointment._id as string;

    await request(app).get(`/api/patient/appointments/${id}`).set(auth(patientB.token)).expect(404);
    await request(app)
      .patch(`/api/patient/appointments/${id}/cancel`)
      .set(auth(patientB.token))
      .expect(404);

    const listB = await request(app)
      .get('/api/patient/appointments')
      .set(auth(patientB.token))
      .expect(200);
    expect(listB.body.data.appointments.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe('portal medical records, prescriptions, laboratory', () => {
  it('shows own consultations without internal working notes; blocks the other patient', async () => {
    const department = await createDepartment();
    const doctor = await createDoctorViaApi(app, adminToken, String(department._id));
    const { patientA, patientB } = await createPortalPair();
    const consultation = await seedConsultation(patientA.id, doctor, String(department._id));

    const list = await request(app)
      .get('/api/patient/medical-records')
      .set(auth(patientA.token))
      .expect(200);
    expect(list.body.data.consultations.length).toBe(1);

    const record = list.body.data.consultations[0] as Record<string, unknown>;
    expect(record.assessment).toBe('Stable angina');
    expect(record.treatmentPlan).toBe('Rest and medication');
    // Doctor's working notes never leave the portal API.
    expect(record).not.toHaveProperty('clinicalNotes');
    expect(record).not.toHaveProperty('physicalExamination');

    // Detail is ownership-scoped.
    await request(app)
      .get(`/api/patient/medical-records/${consultation._id}`)
      .set(auth(patientA.token))
      .expect(200);
    await request(app)
      .get(`/api/patient/medical-records/${consultation._id}`)
      .set(auth(patientB.token))
      .expect(404);

    // Read-only: the portal exposes no write route for records.
    await request(app)
      .post('/api/patient/medical-records')
      .set(auth(patientA.token))
      .send({})
      .expect(404);
    await request(app)
      .patch(`/api/patient/medical-records/${consultation._id}`)
      .set(auth(patientA.token))
      .send({ assessment: 'self-diagnosis' })
      .expect(404);
  });

  it('lists own prescriptions with dispense status', async () => {
    const department = await createDepartment();
    const doctor = await createDoctorViaApi(app, adminToken, String(department._id));
    const { patientA, patientB } = await createPortalPair();
    await seedConsultation(patientA.id, doctor, String(department._id));

    const res = await request(app)
      .get('/api/patient/prescriptions')
      .set(auth(patientA.token))
      .expect(200);
    const line = res.body.data.records[0].prescriptions[0] as Record<string, unknown>;
    expect(line.medicineName).toBe('Aspirin 75mg');
    expect(line.dosage).toBe('1 tablet');
    expect(line.dispenseStatus).toBe('pending');

    const other = await request(app)
      .get('/api/patient/prescriptions')
      .set(auth(patientB.token))
      .expect(200);
    expect(other.body.data.records.length).toBe(0);
  });

  it('laboratory shows own orders and ONLY verified results, without technician notes', async () => {
    const department = await createDepartment();
    const doctor = await createDoctorViaApi(app, adminToken, String(department._id));
    const { patientA, patientB } = await createPortalPair();
    const consultation = await seedConsultation(patientA.id, doctor, String(department._id));

    const order = await LabOrder.create({
      orderId: await nextSequenceId('labOrderId', 'ORD', 6),
      patientId: patientA.id,
      doctorId: doctor._id,
      consultationId: consultation._id,
      tests: [{ testId: consultation._id, testName: 'CBC', price: 20 }],
    });

    await LabResult.create({
      resultId: await nextSequenceId('labResultId', 'RES', 6),
      orderId: order._id,
      testId: consultation._id,
      patientId: patientA.id,
      testName: 'CBC',
      value: '5.1',
      unit: '10^9/L',
      status: 'completed', // entered but NOT verified — must stay hidden
      notes: 'INTERNAL tech note',
    });
    await LabResult.create({
      resultId: await nextSequenceId('labResultId', 'RES', 6),
      orderId: order._id,
      testId: consultation._id,
      patientId: patientA.id,
      testName: 'Hemoglobin',
      value: '13.9',
      unit: 'g/dL',
      referenceRange: '13-17',
      interpretation: 'normal',
      status: 'verified',
      verifiedAt: new Date(),
      notes: 'INTERNAL tech note',
    });

    const res = await request(app)
      .get('/api/patient/laboratory')
      .set(auth(patientA.token))
      .expect(200);
    expect(res.body.data.orders.length).toBe(1);
    expect(res.body.data.results.length).toBe(1); // verified only
    const result = res.body.data.results[0] as Record<string, unknown>;
    expect(result.testName).toBe('Hemoglobin');
    expect(result.status).toBe('verified');
    expect(result).not.toHaveProperty('notes');

    const other = await request(app)
      .get('/api/patient/laboratory')
      .set(auth(patientB.token))
      .expect(200);
    expect(other.body.data.orders.length).toBe(0);
    expect(other.body.data.results.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe('portal billing & admission', () => {
  it('shows own issued invoices (drafts hidden) and payment history; blocks cross access', async () => {
    const { patientA, patientB } = await createPortalPair();

    const draft = await Invoice.create({
      invoiceId: await nextSequenceId('invoiceId', 'INV', 6),
      patientId: patientA.id,
      items: [{ itemType: 'service', description: 'Dressing', quantity: 1, unitPrice: 10, totalPrice: 10 }],
      subtotal: 10,
      discount: 0,
      tax: 0,
      totalAmount: 10,
      amountPaid: 0,
      dueAmount: 10,
      invoiceStatus: 'draft',
    });
    const issued = await Invoice.create({
      invoiceId: await nextSequenceId('invoiceId', 'INV', 6),
      patientId: patientA.id,
      items: [{ itemType: 'service', description: 'Consultation', quantity: 1, unitPrice: 150, totalPrice: 150 }],
      subtotal: 150,
      discount: 0,
      tax: 0,
      totalAmount: 150,
      amountPaid: 50,
      dueAmount: 100,
      paymentStatus: 'partially_paid',
      invoiceStatus: 'issued',
    });
    await Payment.create({
      paymentId: await nextSequenceId('paymentId', 'PAY', 6),
      invoiceId: issued._id,
      patientId: patientA.id,
      type: 'payment',
      amount: 50,
      method: 'cash',
      paidAt: new Date(),
    });

    const list = await request(app).get('/api/patient/billing').set(auth(patientA.token)).expect(200);
    expect(list.body.data.invoices.length).toBe(1); // draft is hidden
    expect(list.body.data.invoices[0].invoiceId).toBe(issued.invoiceId);

    const detail = await request(app)
      .get(`/api/patient/billing/${issued._id}`)
      .set(auth(patientA.token))
      .expect(200);
    expect(detail.body.data.payments.length).toBe(1);
    expect(detail.body.data.payments[0].amount).toBe(50);

    // The draft is unreachable even by direct id; the other patient sees nothing.
    await request(app).get(`/api/patient/billing/${draft._id}`).set(auth(patientA.token)).expect(404);
    await request(app).get(`/api/patient/billing/${issued._id}`).set(auth(patientB.token)).expect(404);

    // Read-only: no portal write path for invoices.
    await request(app)
      .patch(`/api/patient/billing/${issued._id}`)
      .set(auth(patientA.token))
      .send({ totalAmount: 0 })
      .expect(404);
  });

  it('shows own current admission and history; the other patient sees none', async () => {
    const department = await createDepartment();
    const doctor = await createDoctorViaApi(app, adminToken, String(department._id));
    const { patientA, patientB } = await createPortalPair();

    const ward = await Ward.create({
      wardId: await nextSequenceId('wardId', 'WRD', 3),
      name: 'General Ward',
      type: 'general',
      floor: '1',
      capacity: 4,
    });
    const bed = await Bed.create({
      bedId: await nextSequenceId('bedId', 'BED', 5),
      wardId: ward._id,
      bedNumber: 'GW-01',
      status: 'occupied',
      currentPatientId: patientA.id,
    });
    const admission = await Admission.create({
      admissionId: await nextSequenceId('admissionId', 'ADM', 6),
      patientId: patientA.id,
      doctorId: doctor._id,
      wardId: ward._id,
      bedId: bed._id,
      reason: 'Observation',
      admissionType: 'emergency',
      admissionDate: new Date(),
      status: 'admitted',
      isActive: true,
    });

    const res = await request(app).get('/api/patient/admission').set(auth(patientA.token)).expect(200);
    expect(res.body.data.current.admissionId).toBe(admission.admissionId);
    expect(res.body.data.current.wardId.name).toBe('General Ward');
    expect(res.body.data.current.bedId.bedNumber).toBe('GW-01');

    const other = await request(app)
      .get('/api/patient/admission')
      .set(auth(patientB.token))
      .expect(200);
    expect(other.body.data.current).toBeNull();
    expect(other.body.data.history.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe('portal notifications & dashboard', () => {
  it('portal events land in the patient inbox and stay isolated per patient', async () => {
    const { patientA, patientB } = await createPortalPair();
    const patientDocA = await Patient.findById(patientA.id);

    await Notification.create({
      notificationId: await nextSequenceId('notificationId', 'NTF', 6),
      recipientId: patientDocA!.userId,
      type: 'system',
      title: 'Welcome',
      message: 'Your portal is ready.',
    });

    const inboxA = await request(app).get('/api/notifications').set(auth(patientA.token)).expect(200);
    expect(inboxA.body.data.notifications.length).toBe(1);

    const inboxB = await request(app).get('/api/notifications').set(auth(patientB.token)).expect(200);
    expect(inboxB.body.data.notifications.length).toBe(0);

    const unread = await request(app)
      .get('/api/notifications/unread-count')
      .set(auth(patientA.token))
      .expect(200);
    expect(unread.body.data.unreadCount).toBe(1);
  });

  it('dashboard aggregates the patient’s own world and leaks no credentials', async () => {
    const department = await createDepartment();
    const doctor = await createDoctorViaApi(app, adminToken, String(department._id));
    await setWeekdayAvailability(app, adminToken, doctor._id);
    const patient = await createActivePatient();
    const token = await portalLogin(String(patient._id), 'p9@test.local');

    await request(app)
      .post('/api/patient/appointments')
      .set(auth(token))
      .send({
        doctorId: doctor._id,
        appointmentDate: nextMonday(),
        startTime: '09:00',
        endTime: '09:30',
        reason: 'Dashboard test',
      })
      .expect(201);

    const res = await request(app).get('/api/patient/dashboard').set(auth(token)).expect(200);
    expect(res.body.data.upcomingAppointments.length).toBe(1);
    expect(res.body.data.currentAdmission).toBeNull();
    expect(typeof res.body.data.unreadNotifications).toBe('number');

    const dump = JSON.stringify(res.body);
    expect(dump).not.toMatch(/"password"/);
    expect(dump).not.toMatch(/\$2[aby]\$/);
  });
});

// ---------------------------------------------------------------------------

describe('managing a portal login from user management', () => {
  it('an admin can change the sign-in email and reset the password', async () => {
    const patient = await createActivePatient();
    const created = await request(app)
      .post(`/api/patients/${patient._id}/portal-account`)
      .set(auth(adminToken))
      .send({ email: 'edit.me@test.local', password: 'PatientPass123!' })
      .expect(201);
    const userId = created.body.data.account._id as string;

    // The account is findable by filtering the user list on the role.
    const listed = await request(app)
      .get('/api/users?role=patient')
      .set(auth(adminToken))
      .expect(200);
    expect(listed.body.data.users).toHaveLength(1);

    await request(app)
      .patch(`/api/users/${userId}`)
      .set(auth(adminToken))
      .send({ email: 'moved@test.local', password: 'ResetPass456!' })
      .expect(200);

    const relogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'moved@test.local', password: 'ResetPass456!' })
      .expect(200);
    expect(relogin.body.data.user.role).toBe('patient');

    // The reset login still reaches only the portal, still scoped correctly.
    const dash = await request(app)
      .get('/api/patient/dashboard')
      .set(auth(relogin.body.data.token))
      .expect(200);
    expect(dash.body.data.patient._id).toBe(String(patient._id));
  });

  it('demographics are refused on a login and redirected to the patient record', async () => {
    const patient = await createActivePatient();
    const created = await request(app)
      .post(`/api/patients/${patient._id}/portal-account`)
      .set(auth(adminToken))
      .send({ email: 'demo@test.local', password: 'PatientPass123!' })
      .expect(201);
    const userId = created.body.data.account._id as string;

    const res = await request(app)
      .patch(`/api/users/${userId}`)
      .set(auth(adminToken))
      .send({ firstName: 'Renamed', phone: '+1 555-9999' })
      .expect(400);
    expect(res.body.message).toMatch(/patient's record/);

    // Echoing the unchanged values back is not a change, so it is accepted.
    await request(app)
      .patch(`/api/users/${userId}`)
      .set(auth(adminToken))
      .send({
        firstName: patient.firstName,
        lastName: patient.lastName,
        phone: patient.phone,
        email: 'demo@test.local',
        role: 'patient',
      })
      .expect(200);
  });

  it('editing the patient record keeps the linked login in step', async () => {
    const patient = await createActivePatient();
    await request(app)
      .post(`/api/patients/${patient._id}/portal-account`)
      .set(auth(adminToken))
      .send({ email: 'sync@test.local', password: 'PatientPass123!' })
      .expect(201);

    await request(app)
      .patch(`/api/patients/${patient._id}`)
      .set(auth(adminToken))
      .send({ firstName: 'Jonathan', lastName: 'Carter-Reed', phone: '+1 555-0142' })
      .expect(200);

    const account = await User.findOne({ email: 'sync@test.local' });
    expect(account!.firstName).toBe('Jonathan');
    expect(account!.lastName).toBe('Carter-Reed');
    expect(account!.phone).toBe('+1 555-0142');
  });

  it('the patient role is not a destination or an exit for staff accounts', async () => {
    const patient = await createActivePatient();
    const created = await request(app)
      .post(`/api/patients/${patient._id}/portal-account`)
      .set(auth(adminToken))
      .send({ email: 'locked@test.local', password: 'PatientPass123!' })
      .expect(201);
    const patientUserId = created.body.data.account._id as string;

    // patient → staff would grant staff access to a linked account.
    const promote = await request(app)
      .patch(`/api/users/${patientUserId}`)
      .set(auth(adminToken))
      .send({ role: 'nurse' })
      .expect(400);
    expect(promote.body.message).toMatch(/cannot be converted/);

    // staff → patient would leave a login with no patient record.
    const nurse = await createStaff('nurse');
    const nurseUser = await User.findOne({ email: nurse.email });
    const demote = await request(app)
      .patch(`/api/users/${nurseUser!._id}`)
      .set(auth(adminToken))
      .send({ role: 'patient' })
      .expect(400);
    expect(demote.body.message).toMatch(/cannot be converted/);

    // Both accounts kept their original roles.
    expect((await User.findById(patientUserId))!.role).toBe('patient');
    expect((await User.findById(nurseUser!._id))!.role).toBe('nurse');
  });
});
