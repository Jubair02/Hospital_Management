import type { FilterQuery } from 'mongoose';
import Patient, {
  type BloodGroup,
  type Gender,
  type IPatient,
  type PatientStatus,
} from '../models/Patient.js';
import User from '../models/User.js';
import { nextPatientId, getPatientStats } from '../services/patientService.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

interface CreatePatientBody {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender;
  phone: string;
  bloodGroup?: BloodGroup;
  email?: string;
  address?: string;
  emergencyContact?: string;
  emergencyContactName?: string;
  emergencyContactRelation?: string;
  nationalId?: string;
  maritalStatus?: string;
  occupation?: string;
  profileImage?: string;
  medicalHistory?: string[];
  allergies?: string[];
}

type UpdatePatientBody = Partial<CreatePatientBody>;

/** Profile fields an admin/receptionist may change after registration. */
const UPDATABLE_FIELDS = [
  'firstName',
  'lastName',
  'dateOfBirth',
  'gender',
  'bloodGroup',
  'phone',
  'email',
  'address',
  'emergencyContact',
  'emergencyContactName',
  'emergencyContactRelation',
  'nationalId',
  'maritalStatus',
  'occupation',
  'profileImage',
  'medicalHistory',
  'allergies',
] as const;

const CREATED_BY_PROJECTION = 'firstName lastName role';

const queryString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * POST /api/patients
 * Admin + receptionist. Registers a patient with a generated patient ID.
 */
export const createPatient = asyncHandler(async (req, res) => {
  // Shape guaranteed by validateCreatePatient middleware.
  const body = req.body as CreatePatientBody;

  const patient = await Patient.create({
    ...Object.fromEntries(UPDATABLE_FIELDS.map((f) => [f, body[f]])),
    patientId: await nextPatientId(),
    createdBy: req.user!._id,
  });

  await req.audit({
    action: 'patient_created',
    resourceType: 'patient',
    resourceId: patient._id,
    description: `Registered patient ${patient.patientId}.`,
    metadata: { patientId: patient.patientId },
  });

  res.status(201).json({
    success: true,
    message: 'Patient registered successfully',
    data: { patient },
  });
});

/**
 * GET /api/patients?search=&gender=&bloodGroup=&status=&page=&limit=
 * All staff roles. Paginated, searchable, filterable list.
 */
export const getPatients = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(queryString(req.query.page) ?? '', 10) || 1, 1);
  const limit = Math.min(
    Math.max(parseInt(queryString(req.query.limit) ?? '', 10) || 10, 1),
    100
  );

  const filter: FilterQuery<IPatient> = {};

  const gender = queryString(req.query.gender);
  if (gender) filter.gender = gender as Gender;

  const bloodGroup = queryString(req.query.bloodGroup);
  if (bloodGroup) filter.bloodGroup = bloodGroup as BloodGroup;

  const status = queryString(req.query.status);
  if (status) filter.status = status as PatientStatus;

  const search = queryString(req.query.search);
  if (search) {
    const term = escapeRegex(search.trim());
    filter.$or = [
      { patientId: { $regex: term, $options: 'i' } },
      { firstName: { $regex: term, $options: 'i' } },
      { lastName: { $regex: term, $options: 'i' } },
      { phone: { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } },
      { nationalId: { $regex: term, $options: 'i' } },
    ];
  }

  const [patients, total] = await Promise.all([
    Patient.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Patient.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Patients fetched',
    data: {
      patients,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    },
  });
});

/**
 * GET /api/patients/stats
 * Admin + receptionist. Dashboard statistics from the database.
 */
export const getStats = asyncHandler(async (_req, res) => {
  const stats = await getPatientStats();

  res.json({ success: true, message: 'Patient statistics fetched', data: stats });
});

/**
 * GET /api/patients/:id
 * All staff roles.
 */
export const getPatientById = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.id).populate(
    'createdBy',
    CREATED_BY_PROJECTION
  );

  if (!patient) {
    throw new ApiError(404, 'Patient not found');
  }

  res.json({ success: true, message: 'Patient fetched', data: { patient } });
});

/**
 * PATCH /api/patients/:id
 * Admin + receptionist. Updates profile fields; patientId and status are
 * immutable here (status has its own admin-only endpoint).
 */
export const updatePatient = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.id);

  if (!patient) {
    throw new ApiError(404, 'Patient not found');
  }

  const body = req.body as UpdatePatientBody;

  for (const field of UPDATABLE_FIELDS) {
    if (body[field] !== undefined) {
      patient.set(field, body[field]);
    }
  }

  await patient.save();

  // This record is the source of truth for the person, so a linked portal
  // login follows it. Keeping the copy in step here is what lets the user
  // API refuse demographic edits on a patient login.
  if (patient.userId) {
    await User.updateOne(
      { _id: patient.userId },
      { $set: { firstName: patient.firstName, lastName: patient.lastName, phone: patient.phone } }
    );
  }

  await patient.populate('createdBy', CREATED_BY_PROJECTION);

  await req.audit({
    action: 'patient_updated',
    resourceType: 'patient',
    resourceId: patient._id,
    // Which fields changed, never the clinical values themselves.
    description: `Updated patient ${patient.patientId}.`,
    metadata: {
      patientId: patient.patientId,
      fields: UPDATABLE_FIELDS.filter((field) => body[field] !== undefined).join(', '),
    },
  });

  res.json({ success: true, message: 'Patient updated successfully', data: { patient } });
});

/**
 * PATCH /api/patients/:id/status
 * Admin only. Soft activation/deactivation — records are never deleted.
 */
export const updatePatientStatus = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.id);

  if (!patient) {
    throw new ApiError(404, 'Patient not found');
  }

  // Shape guaranteed by validatePatientStatus middleware.
  patient.status = (req.body as { status: PatientStatus }).status;
  await patient.save();
  await patient.populate('createdBy', CREATED_BY_PROJECTION);

  // Deactivating a patient revokes their portal access immediately (the
  // per-request re-check in authenticate sees the inactive account).
  // Reactivation is deliberately NOT automatic — an admin decides.
  if (patient.status === 'inactive' && patient.userId) {
    await User.updateOne(
      { _id: patient.userId, status: 'active' },
      { $set: { status: 'inactive', isActive: false } }
    );
  }

  await req.audit({
    action: 'patient_status_changed',
    resourceType: 'patient',
    resourceId: patient._id,
    description: `Patient ${patient.patientId} set to ${patient.status}.`,
    metadata: { patientId: patient.patientId, status: patient.status },
  });

  res.json({
    success: true,
    message: `Patient ${patient.status === 'active' ? 'activated' : 'deactivated'} successfully`,
    data: { patient },
  });
});

/**
 * POST /api/patients/:id/portal-account
 * Admin + receptionist. Issues a patient-portal login (a User with role
 * `patient`) linked to this patient record. One account per patient, one
 * patient per account — enforced by a partial unique index on userId.
 */
export const createPortalAccount = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.id);

  if (!patient) {
    throw new ApiError(404, 'Patient not found');
  }
  if (patient.status !== 'active') {
    throw new ApiError(400, 'Portal accounts can only be issued for active patients.');
  }
  if (patient.userId) {
    throw new ApiError(409, 'This patient already has a portal account.');
  }

  // Shape guaranteed by validatePortalAccount middleware.
  const { email, password } = req.body as { email: string; password: string };

  if (await User.exists({ email: email.toLowerCase().trim() })) {
    throw new ApiError(409, 'A user with this email already exists');
  }

  const account = await User.create({
    firstName: patient.firstName,
    lastName: patient.lastName,
    email,
    password,
    phone: patient.phone,
    role: 'patient',
  });

  // Claim the link atomically: only succeed if no account was linked in
  // the meantime. On a lost race, remove the just-created login.
  const linked = await Patient.findOneAndUpdate(
    { _id: patient._id, userId: { $exists: false } },
    { $set: { userId: account._id } },
    { new: true }
  );

  if (!linked) {
    await User.deleteOne({ _id: account._id });
    throw new ApiError(409, 'This patient already has a portal account.');
  }

  await req.audit({
    action: 'portal_account_created',
    resourceType: 'patient',
    resourceId: patient._id,
    description: `Portal account issued for patient ${patient.patientId}.`,
    metadata: { patientId: patient.patientId, accountEmail: account.email },
  });

  res.status(201).json({
    success: true,
    message: 'Portal account created successfully',
    data: { patient: linked, account },
  });
});
