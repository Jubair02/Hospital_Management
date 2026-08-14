import type { FilterQuery, Types } from 'mongoose';
import Appointment, {
  STATUS_TRANSITIONS,
  type AppointmentStatus,
  type IAppointment,
} from '../models/Appointment.js';
import Doctor from '../models/Doctor.js';
import Patient from '../models/Patient.js';
import {
  bookAppointment,
  rescheduleChecks,
  getAppointmentStats,
  toCalendarDate,
  type CreateAppointmentInput,
} from '../services/appointmentService.js';
import { notifyDoctor, notifyPatient } from '../services/notificationService.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { escapeRegex } from '../utils/escapeRegex.js';

const POPULATE = [
  { path: 'patientId', select: 'patientId firstName lastName phone status dateOfBirth' },
  { path: 'doctorId', select: 'doctorId firstName lastName specialization status' },
  { path: 'departmentId', select: 'departmentId name' },
  { path: 'createdBy', select: 'firstName lastName role' },
];

const queryString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;


const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Doctors are scoped to their own appointments; null = no doctor profile. */
const doctorScopeFor = async (req: {
  user?: { _id: Types.ObjectId; role: string };
}): Promise<Types.ObjectId | undefined | null> => {
  if (req.user!.role !== 'doctor') return undefined;
  const profile = await Doctor.findOne({ userId: req.user!._id }).select('_id');
  return profile ? profile._id : null;
};

/**
 * POST /api/appointments — admin + receptionist.
 */
export const createAppointment = asyncHandler(async (req, res) => {
  const appointment = await bookAppointment(
    req.body as CreateAppointmentInput,
    req.user!._id
  );

  await req.audit({
    action: 'appointment_created',
    resourceType: 'appointment',
    resourceId: appointment._id,
    description: `Booked appointment ${appointment.appointmentId}.`,
    metadata: {
      appointmentId: appointment.appointmentId,
      date: appointment.appointmentDate.toISOString().slice(0, 10),
      startTime: appointment.startTime,
    },
  });

  await appointment.populate(POPULATE);

  res.status(201).json({
    success: true,
    message: 'Appointment booked successfully',
    data: { appointment },
  });
});

/**
 * GET /api/appointments
 * ?search=&status=&doctorId=&departmentId=&patientId=&dateFrom=&dateTo=&page=&limit=
 * Admin/receptionist/nurse see all; doctors see only their own.
 */
export const getAppointments = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(queryString(req.query.page) ?? '', 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(queryString(req.query.limit) ?? '', 10) || 10, 1), 100);

  const filter: FilterQuery<IAppointment> = {};

  const scope = await doctorScopeFor(req);
  if (scope === null) {
    // Doctor account without a profile — nothing to show.
    res.json({
      success: true,
      message: 'Appointments fetched',
      data: { appointments: [], pagination: { page: 1, limit, total: 0, totalPages: 1 } },
    });
    return;
  }
  if (scope) filter.doctorId = scope;

  const doctorId = queryString(req.query.doctorId);
  if (doctorId && !scope) filter.doctorId = doctorId;

  const departmentId = queryString(req.query.departmentId);
  if (departmentId) filter.departmentId = departmentId;

  const patientId = queryString(req.query.patientId);
  if (patientId) filter.patientId = patientId;

  const status = queryString(req.query.status);
  if (status) filter.status = status as AppointmentStatus;

  const dateFrom = queryString(req.query.dateFrom);
  const dateTo = queryString(req.query.dateTo);
  if ((dateFrom && DATE_RE.test(dateFrom)) || (dateTo && DATE_RE.test(dateTo))) {
    filter.appointmentDate = {
      ...(dateFrom && DATE_RE.test(dateFrom) ? { $gte: toCalendarDate(dateFrom) } : {}),
      ...(dateTo && DATE_RE.test(dateTo) ? { $lte: toCalendarDate(dateTo) } : {}),
    };
  }

  const search = queryString(req.query.search);
  if (search) {
    const term = escapeRegex(search.trim());
    const rx = { $regex: term, $options: 'i' };

    // Resolve patient/doctor matches first, then match appointments.
    const [patientIds, doctorIds] = await Promise.all([
      Patient.find({
        $or: [{ patientId: rx }, { firstName: rx }, { lastName: rx }],
      })
        .select('_id')
        .limit(200)
        .lean(),
      Doctor.find({
        $or: [{ doctorId: rx }, { firstName: rx }, { lastName: rx }],
      })
        .select('_id')
        .limit(200)
        .lean(),
    ]);

    filter.$or = [
      { appointmentId: rx },
      { patientId: { $in: patientIds.map((p) => p._id) } },
      ...(scope ? [] : [{ doctorId: { $in: doctorIds.map((d) => d._id) } }]),
    ];
  }

  const [appointments, total] = await Promise.all([
    Appointment.find(filter)
      .populate(POPULATE)
      .sort({ appointmentDate: -1, startTime: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Appointment.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Appointments fetched',
    data: {
      appointments,
      pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
    },
  });
});

/**
 * GET /api/appointments/stats — admin, receptionist, doctor (own scope).
 */
export const getStats = asyncHandler(async (req, res) => {
  const scope = await doctorScopeFor(req);
  const stats = await getAppointmentStats(scope ?? undefined);

  res.json({ success: true, message: 'Appointment statistics fetched', data: stats });
});

/**
 * GET /api/appointments/:id — doctors only their own.
 */
export const getAppointmentById = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findById(req.params.id).populate(POPULATE);
  if (!appointment) throw new ApiError(404, 'Appointment not found');

  const scope = await doctorScopeFor(req);
  if (scope !== undefined) {
    const doctorRef = appointment.doctorId as unknown as { _id: Types.ObjectId } | null;
    if (!scope || !doctorRef || !scope.equals(doctorRef._id)) {
      throw new ApiError(403, 'You can only view your own appointments.');
    }
  }

  res.json({ success: true, message: 'Appointment fetched', data: { appointment } });
});

/**
 * PATCH /api/appointments/:id — admin + receptionist. Reschedule or edit
 * reason/notes; date/time changes re-run availability + conflict checks.
 */
export const updateAppointment = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) throw new ApiError(404, 'Appointment not found');

  if (appointment.status !== 'scheduled' && appointment.status !== 'confirmed') {
    throw new ApiError(400, `A ${appointment.status} appointment can no longer be edited.`);
  }

  const body = req.body as {
    appointmentDate?: string;
    startTime?: string;
    endTime?: string;
    reason?: string;
    notes?: string;
  };

  const nextDate = body.appointmentDate
    ? toCalendarDate(body.appointmentDate)
    : appointment.appointmentDate;
  const nextStart = body.startTime ?? appointment.startTime;
  const nextEnd = body.endTime ?? appointment.endTime;

  if (nextStart >= nextEnd) {
    throw new ApiError(400, 'End time must be after start time.');
  }

  const timeChanged =
    nextDate.getTime() !== appointment.appointmentDate.getTime() ||
    nextStart !== appointment.startTime ||
    nextEnd !== appointment.endTime;

  if (timeChanged) {
    await rescheduleChecks(appointment, nextDate, nextStart, nextEnd);
    appointment.appointmentDate = nextDate;
    appointment.startTime = nextStart;
    appointment.endTime = nextEnd;
  }

  if (body.reason !== undefined) appointment.reason = body.reason;
  if (body.notes !== undefined) appointment.notes = body.notes;

  await appointment.save();
  await appointment.populate(POPULATE);

  res.json({ success: true, message: 'Appointment updated successfully', data: { appointment } });
});

/** Transitions a doctor may perform on their own appointments. */
const DOCTOR_ALLOWED_TARGETS: AppointmentStatus[] = ['confirmed', 'completed', 'no_show'];

/**
 * PATCH /api/appointments/:id/status
 * Admin/receptionist: any valid transition (including cancellation —
 * records are kept, never deleted). Doctor: own appointments only, and
 * only confirm/complete/no-show.
 */
export const updateAppointmentStatus = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) throw new ApiError(404, 'Appointment not found');

  const target = (req.body as { status: AppointmentStatus }).status;
  const actor = req.user!;

  if (actor.role === 'doctor') {
    const profile = await Doctor.findOne({ userId: actor._id }).select('_id');
    if (!profile || !appointment.doctorId.equals(profile._id)) {
      throw new ApiError(403, 'You can only update your own appointments.');
    }
    if (!DOCTOR_ALLOWED_TARGETS.includes(target)) {
      throw new ApiError(403, 'Doctors can only confirm, complete, or mark no-show.');
    }
  }

  const allowed = STATUS_TRANSITIONS[appointment.status];
  if (!allowed.includes(target)) {
    throw new ApiError(
      400,
      `Cannot change a ${appointment.status} appointment to ${target}. Allowed: ${
        allowed.length ? allowed.join(', ') : 'none'
      }.`
    );
  }

  const previousDoctorId = appointment.doctorId;
  appointment.status = target;
  await appointment.save();

  await req.audit({
    action: 'appointment_status_changed',
    resourceType: 'appointment',
    resourceId: appointment._id,
    description: `Appointment ${appointment.appointmentId} marked ${target}.`,
    metadata: { appointmentId: appointment.appointmentId, status: target },
  });

  if (target === 'cancelled') {
    await notifyDoctor(previousDoctorId, {
      type: 'appointment',
      title: 'Appointment cancelled',
      message: `${appointment.appointmentId} on ${appointment.appointmentDate
        .toISOString()
        .slice(0, 10)} at ${appointment.startTime} was cancelled.`,
      referenceType: 'appointment',
      referenceId: appointment._id,
      dedupeKey: `appointment:cancelled:${appointment._id}`,
    });
  }

  // Portal inbox: status changes reach the patient too (no-op when the
  // patient has no portal account).
  if (target === 'confirmed' || target === 'cancelled') {
    await notifyPatient(appointment.patientId, {
      type: 'appointment',
      title: `Appointment ${target}`,
      message: `Your appointment ${appointment.appointmentId} on ${appointment.appointmentDate
        .toISOString()
        .slice(0, 10)} at ${appointment.startTime} was ${target}.`,
      referenceType: 'appointment',
      referenceId: appointment._id,
      dedupeKey: `appointment:${target}:patient:${appointment._id}`,
    });
  }

  await appointment.populate(POPULATE);

  res.json({
    success: true,
    message: `Appointment marked as ${target.replace('_', '-')}`,
    data: { appointment },
  });
});
