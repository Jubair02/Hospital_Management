import type { RequestHandler } from 'express';
import { isValidObjectId } from 'mongoose';
import ApiError from '../utils/ApiError.js';
import { vitalsErrors } from './vitalsRules.js';
import { CONSULTATION_STATUSES, DIAGNOSIS_TYPES } from '../models/Consultation.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const fail = (errors: string[]): ApiError => new ApiError(400, errors.join(' '));

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

const isBounded = (v: unknown, max: number): boolean => typeof v === 'string' && v.length <= max;


/** POST /api/consultations — body: { appointmentId } */
export const validateStartConsultation: RequestHandler = (req, _res, next) => {
  const { appointmentId } = (req.body ?? {}) as Record<string, unknown>;

  if (!isValidObjectId(appointmentId)) {
    return next(fail(['A valid appointment is required to start a consultation.']));
  }

  next();
};

const TEXT_FIELDS = [
  'chiefComplaint',
  'historyOfPresentIllness',
  'clinicalNotes',
  'physicalExamination',
  'assessment',
  'treatmentPlan',
] as const;

/** PATCH /api/consultations/:id — clinical content updates. */
export const validateUpdateConsultation: RequestHandler = (req, _res, next) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  for (const field of TEXT_FIELDS) {
    if (body[field] !== undefined && !isBounded(body[field], 5000)) {
      errors.push(`${field} must be text of at most 5000 characters.`);
    }
  }

  errors.push(...vitalsErrors(body.vitalSigns));

  // Diagnoses
  if (body.diagnoses !== undefined) {
    if (!Array.isArray(body.diagnoses) || body.diagnoses.length > 20) {
      errors.push('diagnoses must be a list of up to 20 entries.');
    } else {
      body.diagnoses.forEach((entry, index) => {
        if (typeof entry !== 'object' || entry === null) {
          errors.push(`Diagnosis ${index + 1} is invalid.`);
          return;
        }
        const d = entry as Record<string, unknown>;
        if (!isNonEmptyString(d.diagnosis) || d.diagnosis.length > 300) {
          errors.push(`Diagnosis ${index + 1}: text is required (max 300 characters).`);
        }
        if (typeof d.type !== 'string' || !(DIAGNOSIS_TYPES as readonly string[]).includes(d.type)) {
          errors.push(`Diagnosis ${index + 1}: type must be one of ${DIAGNOSIS_TYPES.join(', ')}.`);
        }
        if (d.notes !== undefined && !isBounded(d.notes, 500)) {
          errors.push(`Diagnosis ${index + 1}: notes must be at most 500 characters.`);
        }
      });
    }
  }

  // Prescriptions
  if (body.prescriptions !== undefined) {
    if (!Array.isArray(body.prescriptions) || body.prescriptions.length > 30) {
      errors.push('prescriptions must be a list of up to 30 medicines.');
    } else {
      body.prescriptions.forEach((entry, index) => {
        if (typeof entry !== 'object' || entry === null) {
          errors.push(`Medicine ${index + 1} is invalid.`);
          return;
        }
        const p = entry as Record<string, unknown>;
        const requiredFields: Array<[string, string]> = [
          ['medicineName', 'medicine name'],
          ['dosage', 'dosage'],
          ['frequency', 'frequency'],
          ['duration', 'duration'],
        ];
        for (const [field, label] of requiredFields) {
          if (!isNonEmptyString(p[field]) || (p[field] as string).length > 200) {
            errors.push(`Medicine ${index + 1}: ${label} is required (max 200 characters).`);
          }
        }
        if (p.route !== undefined && !isBounded(p.route, 100)) {
          errors.push(`Medicine ${index + 1}: route must be at most 100 characters.`);
        }
        if (p.instructions !== undefined && !isBounded(p.instructions, 300)) {
          errors.push(`Medicine ${index + 1}: instructions must be at most 300 characters.`);
        }
      });
    }
  }

  // Follow-up: optional, valid date, today or later (it's a future plan).
  if (body.followUpDate !== undefined && body.followUpDate !== null && body.followUpDate !== '') {
    const value = body.followUpDate;
    if (typeof value !== 'string' || !DATE_RE.test(value)) {
      errors.push('Follow-up date must be a valid date (YYYY-MM-DD).');
    } else {
      const date = new Date(`${value}T00:00:00.000Z`);
      const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime())) {
        errors.push('Follow-up date must be a valid date.');
      } else if (date < today) {
        errors.push('Follow-up date cannot be in the past.');
      }
    }
  }

  if (errors.length) return next(fail(errors));
  next();
};

export const validateConsultationStatus: RequestHandler = (req, _res, next) => {
  const { status } = (req.body ?? {}) as Record<string, unknown>;

  if (
    typeof status !== 'string' ||
    !(CONSULTATION_STATUSES as readonly string[]).includes(status)
  ) {
    return next(fail([`Status must be one of: ${CONSULTATION_STATUSES.join(', ')}.`]));
  }

  next();
};
