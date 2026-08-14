import type { Types } from 'mongoose';
import Consultation, {
  CONSULTATION_TRANSITIONS,
  type ConsultationDocument,
  type ConsultationStatus,
} from '../models/Consultation.js';
import Appointment, {
  STATUS_TRANSITIONS,
  type AppointmentDocument,
  type AppointmentStatus,
} from '../models/Appointment.js';
import Doctor, { type DoctorDocument } from '../models/Doctor.js';
import Patient from '../models/Patient.js';
import ApiError from '../utils/ApiError.js';
import { nextSequenceId } from './sequenceService.js';

/** Next human-readable consultation ID (CON-000001, …). */
export const nextConsultationId = (): Promise<string> =>
  nextSequenceId('consultationId', 'CON', 6);

/** The actor's doctor profile, or 403 if none is linked. */
export const requireDoctorProfile = async (userId: Types.ObjectId): Promise<DoctorDocument> => {
  const profile = await Doctor.findOne({ userId });
  if (!profile) {
    throw new ApiError(403, 'No doctor profile is linked to your account.');
  }
  return profile;
};

/**
 * Moves the linked appointment through the EXISTING Phase 3 transition
 * table (never a raw status write). No-ops when already in the target
 * state; throws only on genuinely invalid transitions.
 */
const transitionAppointment = async (
  appointment: AppointmentDocument,
  target: AppointmentStatus
): Promise<void> => {
  if (appointment.status === target) return;

  const allowed = STATUS_TRANSITIONS[appointment.status];
  if (!allowed.includes(target)) {
    throw new ApiError(
      400,
      `The linked appointment is ${appointment.status} and cannot become ${target}.`
    );
  }

  appointment.status = target;
  await appointment.save();
};

/**
 * Starts a consultation for an appointment.
 *
 * Data integrity by construction: the caller provides ONLY the
 * appointment — patient, doctor, and department are copied from it
 * server-side, so consultation/appointment mismatches cannot exist.
 *
 * Ownership: the calling user's doctor profile must be the appointment's
 * doctor.
 *
 * Duplicates: the unique index on appointmentId is the authority — two
 * concurrent starts race at the database and exactly one insert wins
 * (the loser receives the duplicate-key error mapped to 409).
 */
export const startConsultation = async (
  appointmentId: string,
  actorUserId: Types.ObjectId
): Promise<ConsultationDocument> => {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) throw new ApiError(404, 'Appointment not found');

  const profile = await requireDoctorProfile(actorUserId);
  if (!appointment.doctorId.equals(profile._id)) {
    throw new ApiError(403, 'You can only start consultations for your own appointments.');
  }

  if (appointment.status !== 'scheduled' && appointment.status !== 'confirmed') {
    throw new ApiError(
      400,
      `A ${appointment.status} appointment cannot start a consultation.`
    );
  }

  const patient = await Patient.findById(appointment.patientId);
  if (!patient) throw new ApiError(404, 'Patient not found');
  if (patient.status !== 'active') {
    throw new ApiError(400, 'This patient record is inactive.');
  }

  // Friendly pre-check; the unique index remains the real guarantee.
  const existing = await Consultation.findOne({ appointmentId: appointment._id });
  if (existing) {
    throw new ApiError(409, `This appointment already has consultation ${existing.consultationId}.`);
  }

  let consultation: ConsultationDocument;
  try {
    consultation = await Consultation.create({
      consultationId: await nextConsultationId(),
      appointmentId: appointment._id,
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
      departmentId: appointment.departmentId,
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw new ApiError(409, 'This appointment already has a consultation.');
    }
    throw err;
  }

  // The patient is in the room — a scheduled appointment becomes confirmed.
  if (appointment.status === 'scheduled') {
    await transitionAppointment(appointment, 'confirmed');
  }

  return consultation;
};

/** Fields the assigned doctor may edit while in progress. */
export const EDITABLE_FIELDS = [
  'chiefComplaint',
  'historyOfPresentIllness',
  'clinicalNotes',
  'physicalExamination',
  'assessment',
  'vitalSigns',
  'diagnoses',
  'treatmentPlan',
  'prescriptions',
  'followUpDate',
] as const;

export type EditableField = (typeof EDITABLE_FIELDS)[number];

/** 403 unless the consultation belongs to the calling doctor. */
export const assertOwnConsultation = async (
  consultation: ConsultationDocument,
  actorUserId: Types.ObjectId
): Promise<void> => {
  const profile = await requireDoctorProfile(actorUserId);
  if (!consultation.doctorId.equals(profile._id)) {
    throw new ApiError(403, 'You can only work on your own consultations.');
  }
};

export const applyConsultationUpdates = async (
  consultation: ConsultationDocument,
  updates: Partial<Record<EditableField, unknown>>
): Promise<ConsultationDocument> => {
  if (consultation.status !== 'in_progress') {
    throw new ApiError(400, `A ${consultation.status} consultation is read-only.`);
  }

  for (const field of EDITABLE_FIELDS) {
    if (updates[field] !== undefined) {
      consultation.set(field, updates[field]);
    }
  }

  await consultation.save();
  return consultation;
};

/** Minimum clinical content required before completion (§18). */
const COMPLETION_REQUIREMENTS: Array<[string, (c: ConsultationDocument) => boolean]> = [
  ['Chief complaint', (c) => Boolean(c.chiefComplaint?.trim())],
  ['Assessment', (c) => Boolean(c.assessment?.trim())],
  ['At least one diagnosis', (c) => c.diagnoses.length > 0],
  ['Treatment plan', (c) => Boolean(c.treatmentPlan?.trim())],
];

/**
 * Applies a status transition. Completing enforces the minimum clinical
 * record and marks the linked appointment completed through the existing
 * appointment transition rules.
 */
export const transitionConsultation = async (
  consultation: ConsultationDocument,
  target: ConsultationStatus
): Promise<ConsultationDocument> => {
  const allowed = CONSULTATION_TRANSITIONS[consultation.status];
  if (!allowed.includes(target)) {
    throw new ApiError(
      400,
      `Cannot change a ${consultation.status} consultation to ${target}. Allowed: ${
        allowed.length ? allowed.join(', ') : 'none'
      }.`
    );
  }

  if (target === 'completed') {
    const missing = COMPLETION_REQUIREMENTS.filter(([, ok]) => !ok(consultation)).map(
      ([label]) => label
    );
    if (missing.length) {
      throw new ApiError(400, `Complete the clinical record first. Missing: ${missing.join(', ')}.`);
    }
  }

  consultation.status = target;
  await consultation.save();

  if (target === 'completed') {
    const appointment = await Appointment.findById(consultation.appointmentId);
    if (appointment && appointment.status !== 'completed') {
      await transitionAppointment(appointment, 'completed');
    }
  }

  return consultation;
};

export interface ConsultationStats {
  totalConsultations: number;
  completedConsultations: number;
  inProgressConsultations: number;
  todaysConsultations: number;
  completedToday: number;
}

/** Dashboard statistics; doctorScope limits the numbers to one doctor. */
export const getConsultationStats = async (
  doctorScope?: Types.ObjectId
): Promise<ConsultationStats> => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const scope = doctorScope ? { doctorId: doctorScope } : {};

  const [
    totalConsultations,
    completedConsultations,
    inProgressConsultations,
    todaysConsultations,
    completedToday,
  ] = await Promise.all([
    Consultation.countDocuments({ ...scope }),
    Consultation.countDocuments({ ...scope, status: 'completed' }),
    Consultation.countDocuments({ ...scope, status: 'in_progress' }),
    Consultation.countDocuments({ ...scope, consultationDate: { $gte: startOfDay } }),
    Consultation.countDocuments({
      ...scope,
      status: 'completed',
      consultationDate: { $gte: startOfDay },
    }),
  ]);

  return {
    totalConsultations,
    completedConsultations,
    inProgressConsultations,
    todaysConsultations,
    completedToday,
  };
};
