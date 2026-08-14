import './env.js';
import request from 'supertest';
import type { Express } from 'express';
import Department, { type DepartmentDocument } from '../models/Department.js';
import Patient, { type PatientDocument } from '../models/Patient.js';
import { nextSequenceId } from '../services/sequenceService.js';

export interface DoctorJson {
  _id: string;
  doctorId: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  specialization: string;
  status: string;
  licenseNumber?: string;
  availability: Array<{
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    isAvailable: boolean;
  }>;
}

export interface AppointmentJson {
  _id: string;
  appointmentId: string;
  status: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  reason: string;
  patientId: { _id: string; patientId: string; firstName: string } | null;
  doctorId: { _id: string; doctorId: string; firstName: string } | null;
  departmentId: { _id: string; name: string } | null;
  createdBy?: { firstName: string; role: string } | null;
}

export const createDepartment = async (
  name = 'Cardiology',
  status: 'active' | 'inactive' = 'active'
): Promise<DepartmentDocument> =>
  Department.create({
    departmentId: await nextSequenceId('departmentId', 'DEP', 3),
    name,
    status,
  });

export const createActivePatient = async (
  overrides: Record<string, unknown> = {}
): Promise<PatientDocument> =>
  Patient.create({
    patientId: await nextSequenceId('patientId', 'PAT', 6),
    firstName: 'John',
    lastName: 'Carter',
    dateOfBirth: new Date('1985-04-12'),
    gender: 'male',
    phone: '+1 555-0100',
    ...overrides,
  });

let doctorSeq = 0;

/** Creates a doctor (new user account path) via the API as admin. */
export const createDoctorViaApi = async (
  app: Express,
  adminToken: string,
  departmentId: string,
  overrides: Record<string, unknown> = {}
): Promise<DoctorJson> => {
  doctorSeq += 1;
  const res = await request(app)
    .post('/api/doctors')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      user: {
        firstName: 'Greg',
        lastName: `House${doctorSeq}`,
        email: `greg.house${doctorSeq}@test.local`,
        password: 'DoctorPass123!',
        phone: '555-0900',
      },
      specialization: 'Cardiology',
      departmentId,
      licenseNumber: `LIC-${1000 + doctorSeq}`,
      experienceYears: 12,
      consultationFee: 150,
      ...overrides,
    })
    .expect(201);

  return res.body.data.doctor as DoctorJson;
};

/** Weekday availability 09:00–17:00 for the given doctor, set as admin. */
export const setWeekdayAvailability = async (
  app: Express,
  adminToken: string,
  doctorMongoId: string
): Promise<void> => {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  await request(app)
    .put(`/api/doctors/${doctorMongoId}/availability`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      availability: days.map((dayOfWeek) => ({
        dayOfWeek,
        startTime: '09:00',
        endTime: '17:00',
        isAvailable: true,
      })),
    })
    .expect(200);
};

/** The next Monday from now, as YYYY-MM-DD (always within weekday availability). */
export const nextMonday = (): string => {
  const date = new Date();
  const daysAhead = (8 - date.getUTCDay()) % 7 || 7;
  date.setUTCDate(date.getUTCDate() + daysAhead);
  return date.toISOString().slice(0, 10);
};
