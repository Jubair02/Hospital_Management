import './env.js';
import { beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Express } from 'express';
import User, { type IUser, type Role, type UserDocument } from '../models/User.js';
import Patient from '../models/Patient.js';
import Counter from '../models/Counter.js';
import Department from '../models/Department.js';
import Doctor from '../models/Doctor.js';
import Appointment from '../models/Appointment.js';
import Consultation from '../models/Consultation.js';
import Medicine from '../models/Medicine.js';
import MedicineCategory from '../models/MedicineCategory.js';
import InventoryBatch from '../models/InventoryBatch.js';
import StockTransaction from '../models/StockTransaction.js';
import PrescriptionFulfillment from '../models/PrescriptionFulfillment.js';
import DispensingRecord from '../models/DispensingRecord.js';
import LabCategory from '../models/LabCategory.js';
import LabTest from '../models/LabTest.js';
import LabOrder from '../models/LabOrder.js';
import LabSample from '../models/LabSample.js';
import LabResult from '../models/LabResult.js';
import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import Ward from '../models/Ward.js';
import Bed from '../models/Bed.js';
import Admission from '../models/Admission.js';
import BedTransfer from '../models/BedTransfer.js';
import Notification from '../models/Notification.js';
import AuditLog from '../models/AuditLog.js';
import SystemSetting from '../models/SystemSetting.js';

export interface SeedUser {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
  role: Role;
}

export const ADMIN: SeedUser = {
  firstName: 'Test',
  lastName: 'Admin',
  email: 'admin@test.local',
  password: 'AdminPass123!',
  role: 'admin',
};

export const DOCTOR: SeedUser = {
  firstName: 'Jane',
  lastName: 'Miller',
  email: 'jane.miller@test.local',
  password: 'DoctorPass123!',
  phone: '555-0101',
  role: 'doctor',
};

/**
 * Boots an isolated in-memory MongoDB for the current test file and
 * wipes the users collection between tests.
 */
export function setupTestDB(): void {
  let mongod: MongoMemoryServer;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    // Index builds are asynchronous — wait for them so unique and
    // partial indexes are enforceable before concurrency tests run.
    await Promise.all(Object.values(mongoose.connection.models).map((m) => m.init()));
  }, 120_000);

  afterEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      Patient.deleteMany({}),
      Counter.deleteMany({}),
      Department.deleteMany({}),
      Doctor.deleteMany({}),
      Appointment.deleteMany({}),
      Consultation.deleteMany({}),
      Medicine.deleteMany({}),
      MedicineCategory.deleteMany({}),
      InventoryBatch.deleteMany({}),
      StockTransaction.deleteMany({}),
      PrescriptionFulfillment.deleteMany({}),
      DispensingRecord.deleteMany({}),
      LabCategory.deleteMany({}),
      LabTest.deleteMany({}),
      LabOrder.deleteMany({}),
      LabSample.deleteMany({}),
      LabResult.deleteMany({}),
      Invoice.deleteMany({}),
      Payment.deleteMany({}),
      Ward.deleteMany({}),
      Bed.deleteMany({}),
      Admission.deleteMany({}),
      BedTransfer.deleteMany({}),
      Notification.deleteMany({}),
      AuditLog.deleteMany({}),
      SystemSetting.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });
}

export const createAdmin = (
  overrides: Partial<IUser & { password: string }> = {}
): Promise<UserDocument> => User.create({ ...ADMIN, ...overrides });

/** Creates a staff account for the given role and returns its login credentials. */
export const createStaff = async (role: Role): Promise<{ email: string; password: string }> => {
  const creds = { email: `${role}@test.local`, password: 'StaffPass123!' };
  await User.create({
    firstName: 'Staff',
    lastName: role.charAt(0).toUpperCase() + role.slice(1),
    role,
    ...creds,
  });
  return creds;
};

export const loginAs = async (
  app: Express,
  { email, password }: { email: string; password: string }
): Promise<string> => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);
  return res.body.data.token as string;
};
