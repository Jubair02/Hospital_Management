import type { Types } from 'mongoose';
import Doctor, { type DoctorDocument, type IAvailabilitySlot } from '../models/Doctor.js';
import User from '../models/User.js';
import Department from '../models/Department.js';
import ApiError from '../utils/ApiError.js';
import { nextSequenceId } from './sequenceService.js';

/** Next human-readable doctor ID (DOC-0001, DOC-0002, …). */
export const nextDoctorId = (): Promise<string> => nextSequenceId('doctorId', 'DOC', 4);

export interface DoctorProfileInput {
  specialization: string;
  departmentId: string;
  qualification?: string;
  licenseNumber?: string;
  experienceYears?: number;
  consultationFee?: number;
  profileImage?: string;
  bio?: string;
}

export interface NewDoctorUserInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
}

/**
 * Creates a doctor profile linked to a user account.
 *
 * Authentication stays entirely in the existing User model — this either
 * links an EXISTING user with role "doctor" (userId) or creates a new
 * one through User.create (bcrypt hashing via the model's pre-save
 * hook). No credentials are ever stored on the Doctor document.
 */
export const createDoctorProfile = async (
  profile: DoctorProfileInput,
  options: { userId?: string; user?: NewDoctorUserInput },
  _actorId: Types.ObjectId
): Promise<DoctorDocument> => {
  const department = await Department.findById(profile.departmentId);
  if (!department) throw new ApiError(404, 'Department not found');
  if (department.status !== 'active') {
    throw new ApiError(400, 'Cannot assign a doctor to an inactive department.');
  }

  let user;

  if (options.userId) {
    user = await User.findById(options.userId);
    if (!user) throw new ApiError(404, 'User account not found');
    if (user.role !== 'doctor') {
      throw new ApiError(400, 'The linked user account must have the doctor role.');
    }
    const existingProfile = await Doctor.findOne({ userId: user._id });
    if (existingProfile) {
      throw new ApiError(409, 'This user already has a doctor profile.');
    }
  } else if (options.user) {
    // Reuses the existing user-creation path: same model, same hashing,
    // same validation. Role is forced to "doctor".
    user = await User.create({ ...options.user, role: 'doctor' });
  } else {
    throw new ApiError(400, 'Provide either userId (existing user) or user (new account).');
  }

  try {
    return await Doctor.create({
      userId: user._id,
      doctorId: await nextDoctorId(),
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      ...profile,
    });
  } catch (err) {
    // If profile creation fails after we just created the account,
    // remove the orphaned account so the operation stays all-or-nothing.
    if (!options.userId) {
      await User.deleteOne({ _id: user._id });
    }
    throw err;
  }
};

const SYNCED_FIELDS = ['firstName', 'lastName', 'phone'] as const;

/**
 * Applies profile updates and keeps the denormalized name/phone in sync
 * with the linked User account so listings never drift.
 */
export const updateDoctorProfile = async (
  doctor: DoctorDocument,
  updates: Partial<DoctorProfileInput & { firstName: string; lastName: string; phone: string }>
): Promise<DoctorDocument> => {
  if (updates.departmentId !== undefined) {
    const department = await Department.findById(updates.departmentId);
    if (!department) throw new ApiError(404, 'Department not found');
    if (department.status !== 'active') {
      throw new ApiError(400, 'Cannot assign a doctor to an inactive department.');
    }
  }

  const editable = [
    'firstName',
    'lastName',
    'phone',
    'specialization',
    'departmentId',
    'qualification',
    'licenseNumber',
    'experienceYears',
    'consultationFee',
    'profileImage',
    'bio',
  ] as const;

  for (const field of editable) {
    if (updates[field] !== undefined) {
      doctor.set(field, updates[field]);
    }
  }

  await doctor.save();

  const userSync: Record<string, unknown> = {};
  for (const field of SYNCED_FIELDS) {
    if (updates[field] !== undefined) userSync[field] = updates[field];
  }
  if (Object.keys(userSync).length > 0) {
    await User.updateOne({ _id: doctor.userId }, { $set: userSync }, { runValidators: true });
  }

  return doctor;
};

/** Replaces a doctor's weekly availability (validated by middleware). */
export const replaceAvailability = async (
  doctor: DoctorDocument,
  slots: IAvailabilitySlot[]
): Promise<DoctorDocument> => {
  doctor.availability = slots;
  await doctor.save();
  return doctor;
};
