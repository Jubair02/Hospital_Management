import type { FilterQuery, Types } from 'mongoose';
import Consultation, {
  type ConsultationStatus,
  type IConsultation,
} from '../models/Consultation.js';
import Doctor from '../models/Doctor.js';
import {
  startConsultation,
  applyConsultationUpdates,
  assertOwnConsultation,
  transitionConsultation,
  getConsultationStats,
  type EditableField,
} from '../services/consultationService.js';
import { toCalendarDate } from '../services/appointmentService.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

const POPULATE = [
  { path: 'patientId', select: 'patientId firstName lastName phone status dateOfBirth gender bloodGroup allergies' },
  { path: 'doctorId', select: 'doctorId firstName lastName specialization' },
  { path: 'departmentId', select: 'departmentId name' },
  { path: 'appointmentId', select: 'appointmentId appointmentDate startTime endTime status' },
];

const queryString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface Actor {
  _id: Types.ObjectId;
  role: string;
}

/**
 * Visibility rules for clinical records:
 *  - admin: every consultation (read-only)
 *  - doctor: their own (any status) plus completed records of other
 *    doctors (clinical history review)
 *  - nurse: completed records only
 *  - receptionist: no access (enforced at the route)
 */
const visibilityFilter = async (actor: Actor): Promise<FilterQuery<IConsultation>> => {
  if (actor.role === 'admin') return {};

  if (actor.role === 'doctor') {
    const profile = await Doctor.findOne({ userId: actor._id }).select('_id');
    if (!profile) return { status: 'completed' };
    return { $or: [{ doctorId: profile._id }, { status: 'completed' }] };
  }

  // nurse
  return { status: 'completed' };
};

const canSee = async (actor: Actor, consultation: IConsultation): Promise<boolean> => {
  if (actor.role === 'admin') return true;
  if (consultation.status === 'completed') return true;

  if (actor.role === 'doctor') {
    const profile = await Doctor.findOne({ userId: actor._id }).select('_id');
    const doctorRef = consultation.doctorId as unknown as { _id: Types.ObjectId };
    return Boolean(profile && doctorRef && profile._id.equals(doctorRef._id));
  }

  return false;
};

/**
 * POST /api/consultations — doctor only. Body: { appointmentId }.
 * Patient/doctor/department are derived from the appointment.
 */
export const createConsultation = asyncHandler(async (req, res) => {
  const { appointmentId } = req.body as { appointmentId: string };

  const consultation = await startConsultation(appointmentId, req.user!._id);

  await req.audit({
    action: 'consultation_started',
    resourceType: 'consultation',
    resourceId: consultation._id,
    description: `Started consultation ${consultation.consultationId}.`,
    metadata: { consultationId: consultation.consultationId },
  });

  await consultation.populate(POPULATE);

  res.status(201).json({
    success: true,
    message: 'Consultation started',
    data: { consultation },
  });
});

/** Shared list logic for the various consultation listings. */
const listConsultations = async (
  actor: Actor,
  query: Record<string, unknown>,
  forced: FilterQuery<IConsultation> = {}
) => {
  const page = Math.max(parseInt(queryString(query.page) ?? '', 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(queryString(query.limit) ?? '', 10) || 10, 1), 100);

  const filter: FilterQuery<IConsultation> = { ...(await visibilityFilter(actor)), ...forced };

  const status = queryString(query.status);
  if (status) filter.status = status as ConsultationStatus;

  const doctorId = queryString(query.doctorId);
  if (doctorId && !filter.doctorId) filter.doctorId = doctorId;

  const appointmentId = queryString(query.appointmentId);
  if (appointmentId) filter.appointmentId = appointmentId;

  const patientId = queryString(query.patientId);
  if (patientId && !filter.patientId) filter.patientId = patientId;

  const dateFrom = queryString(query.dateFrom);
  const dateTo = queryString(query.dateTo);
  if ((dateFrom && DATE_RE.test(dateFrom)) || (dateTo && DATE_RE.test(dateTo))) {
    const to = dateTo && DATE_RE.test(dateTo) ? toCalendarDate(dateTo) : undefined;
    if (to) to.setUTCDate(to.getUTCDate() + 1); // inclusive end of day
    filter.consultationDate = {
      ...(dateFrom && DATE_RE.test(dateFrom) ? { $gte: toCalendarDate(dateFrom) } : {}),
      ...(to ? { $lt: to } : {}),
    };
  }

  const [consultations, total] = await Promise.all([
    Consultation.find(filter)
      .populate(POPULATE)
      .sort({ consultationDate: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Consultation.countDocuments(filter),
  ]);

  return {
    consultations,
    pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
  };
};

/**
 * GET /api/consultations — admin, doctor (own + completed), nurse (completed).
 */
export const getConsultations = asyncHandler(async (req, res) => {
  const data = await listConsultations(req.user!, req.query as Record<string, unknown>);
  res.json({ success: true, message: 'Consultations fetched', data });
});

/**
 * GET /api/consultations/stats — admin (global), doctor (own scope).
 */
export const getStats = asyncHandler(async (req, res) => {
  let scope: Types.ObjectId | undefined;

  if (req.user!.role === 'doctor') {
    const profile = await Doctor.findOne({ userId: req.user!._id }).select('_id');
    if (!profile) throw new ApiError(403, 'No doctor profile is linked to your account.');
    scope = profile._id;
  }

  const stats = await getConsultationStats(scope);
  res.json({ success: true, message: 'Consultation statistics fetched', data: stats });
});

/**
 * GET /api/consultations/:id — same visibility rules as the list.
 */
export const getConsultationById = asyncHandler(async (req, res) => {
  const consultation = await Consultation.findById(req.params.id).populate(POPULATE);
  if (!consultation) throw new ApiError(404, 'Consultation not found');

  if (!(await canSee(req.user!, consultation))) {
    throw new ApiError(403, 'You do not have access to this consultation.');
  }

  res.json({ success: true, message: 'Consultation fetched', data: { consultation } });
});

/**
 * PATCH /api/consultations/:id — assigned doctor, in-progress only.
 */
export const updateConsultation = asyncHandler(async (req, res) => {
  const consultation = await Consultation.findById(req.params.id);
  if (!consultation) throw new ApiError(404, 'Consultation not found');

  await assertOwnConsultation(consultation, req.user!._id);

  const updates = req.body as Partial<Record<EditableField, unknown>>;
  const prescriptionsChanged = Array.isArray(updates.prescriptions);

  await applyConsultationUpdates(consultation, updates);
  await consultation.populate(POPULATE);

  // Prescribing is a distinct clinical act worth its own trail entry.
  if (prescriptionsChanged && consultation.prescriptions.length > 0) {
    await req.audit({
      action: 'prescription_created',
      resourceType: 'prescription',
      resourceId: consultation._id,
      description: `Recorded ${consultation.prescriptions.length} prescribed medicine(s) on ${consultation.consultationId}.`,
      // Counts only — no medicine names, dosages, or clinical detail.
      metadata: { consultationId: consultation.consultationId, medicines: consultation.prescriptions.length },
    });
  }

  await req.audit({
    action: 'consultation_updated',
    resourceType: 'consultation',
    resourceId: consultation._id,
    description: `Updated consultation ${consultation.consultationId}.`,
    metadata: { consultationId: consultation.consultationId },
  });

  res.json({ success: true, message: 'Consultation saved', data: { consultation } });
});

/**
 * PATCH /api/consultations/:id/status — assigned doctor. Completing
 * requires the minimum clinical record and locks the consultation.
 */
export const updateConsultationStatus = asyncHandler(async (req, res) => {
  const consultation = await Consultation.findById(req.params.id);
  if (!consultation) throw new ApiError(404, 'Consultation not found');

  await assertOwnConsultation(consultation, req.user!._id);
  await transitionConsultation(
    consultation,
    (req.body as { status: ConsultationStatus }).status
  );

  if (consultation.status === 'completed') {
    await req.audit({
      action: 'consultation_completed',
      resourceType: 'consultation',
      resourceId: consultation._id,
      description: `Completed consultation ${consultation.consultationId} (record locked).`,
      metadata: {
        consultationId: consultation.consultationId,
        diagnoses: consultation.diagnoses.length,
      },
    });
  }

  await consultation.populate(POPULATE);

  res.json({
    success: true,
    message: `Consultation ${consultation.status.replace('_', ' ')}`,
    data: { consultation },
  });
});

/**
 * GET /api/patients/:patientId/consultations — clinical history for a
 * patient (admin, doctor, nurse; receptionist has no clinical access).
 */
export const getPatientConsultations = asyncHandler(async (req, res) => {
  const data = await listConsultations(req.user!, req.query as Record<string, unknown>, {
    patientId: req.params.patientId,
  });
  res.json({ success: true, message: 'Patient consultations fetched', data });
});

/**
 * GET /api/doctors/:doctorId/consultations — admin any doctor; a doctor
 * only their own.
 */
export const getDoctorConsultations = asyncHandler(async (req, res) => {
  if (req.user!.role === 'doctor') {
    const profile = await Doctor.findOne({ userId: req.user!._id }).select('_id');
    if (!profile || String(profile._id) !== req.params.doctorId) {
      throw new ApiError(403, 'You can only view your own consultations.');
    }
  }

  const data = await listConsultations(req.user!, req.query as Record<string, unknown>, {
    doctorId: req.params.doctorId,
  });
  res.json({ success: true, message: 'Doctor consultations fetched', data });
});
