import type { FilterQuery } from 'mongoose';
import Observation, { type IObservation } from '../models/Observation.js';
import { isEmptyVitals, type IVitalSigns } from '../models/vitalSigns.js';
import { nextSequenceId } from '../services/sequenceService.js';
import { resolveNursingTarget } from '../services/nursingService.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

const POPULATE = [
  { path: 'patientId', select: 'patientId firstName lastName' },
  { path: 'recordedBy', select: 'firstName lastName role' },
  { path: 'admissionId', select: 'admissionId wardId bedId' },
];

interface CreateObservationBody {
  patientId?: string;
  admissionId?: string;
  recordedAt?: string;
  vitalSigns?: IVitalSigns;
  notes?: string;
}

/**
 * POST /api/observations
 * Nurses, doctors, and admins record a set of measurements.
 *
 * The admission is resolved here rather than asked for: a nurse at a bedside
 * knows the patient, and requiring them to also name the admission invites
 * filing an observation against a discharged stay.
 */
export const createObservation = asyncHandler(async (req, res) => {
  const body = req.body as CreateObservationBody;
  const actor = req.user!;

  if (!body.patientId) throw new ApiError(400, 'Patient is required.');

  if (isEmptyVitals(body.vitalSigns) && !body.notes?.trim()) {
    throw new ApiError(400, 'Record at least one measurement or a note.');
  }

  const { patient, admission } = await resolveNursingTarget(actor, body.patientId);

  const observation = await Observation.create({
    observationId: await nextSequenceId('observationId', 'OBS', 6),
    patientId: patient._id,
    admissionId: admission?._id,
    recordedBy: actor._id,
    recordedAt: body.recordedAt ? new Date(body.recordedAt) : new Date(),
    vitalSigns: body.vitalSigns ?? {},
    notes: body.notes,
  });

  await observation.populate(POPULATE);

  await req.audit({
    action: 'observation_recorded',
    resourceType: 'observation',
    resourceId: observation._id,
    description: `Observation ${observation.observationId} recorded for ${patient.patientId}.`,
    metadata: {
      observationId: observation.observationId,
      patientId: patient.patientId,
      admissionId: admission?.admissionId,
    },
  });

  res.status(201).json({
    success: true,
    message: 'Observation recorded',
    data: { observation },
  });
});

/**
 * GET /api/observations?patientId=&admissionId=&page=&limit=
 * Clinical readers. Newest first — the last reading is the one being asked for.
 */
export const getObservations = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(String(req.query.page ?? ''), 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? ''), 10) || 20, 1), 100);

  const filter: FilterQuery<IObservation> = {};
  if (typeof req.query.patientId === 'string' && req.query.patientId) {
    filter.patientId = req.query.patientId;
  }
  if (typeof req.query.admissionId === 'string' && req.query.admissionId) {
    filter.admissionId = req.query.admissionId;
  }

  const [observations, total] = await Promise.all([
    Observation.find(filter)
      .populate(POPULATE)
      .sort({ recordedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Observation.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Observations fetched',
    data: {
      observations,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    },
  });
});
