import type { FilterQuery } from 'mongoose';
import Doctor, { type IAvailabilitySlot, type IDoctor } from '../models/Doctor.js';
import {
  createDoctorProfile,
  updateDoctorProfile,
  replaceAvailability,
  type DoctorProfileInput,
  type NewDoctorUserInput,
} from '../services/doctorService.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { escapeRegex } from '../utils/escapeRegex.js';

const DEPARTMENT_PROJECTION = 'departmentId name status';

const queryString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;


/**
 * GET /api/doctors?search=&departmentId=&specialization=&status=&page=&limit=
 * All staff roles (doctors are directory information inside the hospital).
 */
export const getDoctors = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(queryString(req.query.page) ?? '', 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(queryString(req.query.limit) ?? '', 10) || 10, 1), 100);

  const filter: FilterQuery<IDoctor> = {};

  const departmentId = queryString(req.query.departmentId);
  if (departmentId) filter.departmentId = departmentId;

  const specialization = queryString(req.query.specialization);
  if (specialization) {
    filter.specialization = { $regex: `^${escapeRegex(specialization)}$`, $options: 'i' };
  }

  const status = queryString(req.query.status);
  if (status === 'active' || status === 'inactive') filter.status = status;

  const search = queryString(req.query.search);
  if (search) {
    const term = escapeRegex(search.trim());
    filter.$or = [
      { doctorId: { $regex: term, $options: 'i' } },
      { firstName: { $regex: term, $options: 'i' } },
      { lastName: { $regex: term, $options: 'i' } },
      { specialization: { $regex: term, $options: 'i' } },
      { phone: { $regex: term, $options: 'i' } },
      { licenseNumber: { $regex: term, $options: 'i' } },
    ];
  }

  const [doctors, total] = await Promise.all([
    Doctor.find(filter)
      .populate('departmentId', DEPARTMENT_PROJECTION)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Doctor.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Doctors fetched',
    data: {
      doctors,
      pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
    },
  });
});

/**
 * GET /api/doctors/specializations
 * Distinct specializations for the filter dropdown.
 */
export const getSpecializations = asyncHandler(async (_req, res) => {
  const specializations = (await Doctor.distinct('specialization')).sort();
  res.json({ success: true, message: 'Specializations fetched', data: { specializations } });
});

/**
 * GET /api/doctors/me
 * The doctor's own profile (used by availability page and dashboard).
 */
export const getMyDoctorProfile = asyncHandler(async (req, res) => {
  const doctor = await Doctor.findOne({ userId: req.user!._id }).populate(
    'departmentId',
    DEPARTMENT_PROJECTION
  );

  if (!doctor) {
    throw new ApiError(404, 'No doctor profile is linked to your account yet. Ask an administrator.');
  }

  res.json({ success: true, message: 'Doctor profile fetched', data: { doctor } });
});

/**
 * POST /api/doctors — admin only. Links an existing doctor-role user or
 * creates a new user account through the existing User model.
 */
export const createDoctor = asyncHandler(async (req, res) => {
  const body = req.body as DoctorProfileInput & { userId?: string; user?: NewDoctorUserInput };

  const doctor = await createDoctorProfile(
    {
      specialization: body.specialization,
      departmentId: body.departmentId,
      qualification: body.qualification,
      licenseNumber: body.licenseNumber,
      experienceYears: body.experienceYears,
      consultationFee: body.consultationFee,
      profileImage: body.profileImage,
      bio: body.bio,
    },
    { userId: body.userId, user: body.user },
    req.user!._id
  );

  await doctor.populate('departmentId', DEPARTMENT_PROJECTION);

  res.status(201).json({ success: true, message: 'Doctor created successfully', data: { doctor } });
});

/**
 * GET /api/doctors/:id — all staff roles.
 */
export const getDoctorById = asyncHandler(async (req, res) => {
  const doctor = await Doctor.findById(req.params.id).populate(
    'departmentId',
    DEPARTMENT_PROJECTION
  );
  if (!doctor) throw new ApiError(404, 'Doctor not found');

  res.json({ success: true, message: 'Doctor fetched', data: { doctor } });
});

/**
 * PATCH /api/doctors/:id — admin only.
 */
export const updateDoctor = asyncHandler(async (req, res) => {
  const doctor = await Doctor.findById(req.params.id);
  if (!doctor) throw new ApiError(404, 'Doctor not found');

  await updateDoctorProfile(doctor, req.body as Parameters<typeof updateDoctorProfile>[1]);
  await doctor.populate('departmentId', DEPARTMENT_PROJECTION);

  res.json({ success: true, message: 'Doctor updated successfully', data: { doctor } });
});

/**
 * PATCH /api/doctors/:id/status — admin only. Soft status; affects
 * bookability, not the linked user's login.
 */
export const updateDoctorStatus = asyncHandler(async (req, res) => {
  const doctor = await Doctor.findById(req.params.id);
  if (!doctor) throw new ApiError(404, 'Doctor not found');

  doctor.status = (req.body as { status: 'active' | 'inactive' }).status;
  await doctor.save();
  await doctor.populate('departmentId', DEPARTMENT_PROJECTION);

  res.json({
    success: true,
    message: `Doctor ${doctor.status === 'active' ? 'activated' : 'deactivated'} successfully`,
    data: { doctor },
  });
});

/**
 * GET /api/doctors/:id/availability — all staff roles.
 */
export const getAvailability = asyncHandler(async (req, res) => {
  const doctor = await Doctor.findById(req.params.id).select('doctorId firstName lastName availability');
  if (!doctor) throw new ApiError(404, 'Doctor not found');

  res.json({
    success: true,
    message: 'Availability fetched',
    data: { availability: doctor.availability },
  });
});

/**
 * PUT /api/doctors/:id/availability
 * Admin manages anyone; a doctor may only modify their OWN availability.
 */
export const putAvailability = asyncHandler(async (req, res) => {
  const doctor = await Doctor.findById(req.params.id);
  if (!doctor) throw new ApiError(404, 'Doctor not found');

  const actor = req.user!;
  const ownsProfile = doctor.userId.equals(actor._id);

  if (actor.role !== 'admin' && !ownsProfile) {
    throw new ApiError(403, 'You can only manage your own availability.');
  }

  const { availability } = req.body as { availability: IAvailabilitySlot[] };
  await replaceAvailability(doctor, availability);

  res.json({
    success: true,
    message: 'Availability updated successfully',
    data: { availability: doctor.availability },
  });
});
