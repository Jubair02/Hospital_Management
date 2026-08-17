import type { FilterQuery } from 'mongoose';
import MedicationAdministration, {
  type IMedicationAdministration,
} from '../models/MedicationAdministration.js';
import NursingNote, { type INursingNote } from '../models/NursingNote.js';
import Consultation from '../models/Consultation.js';
import { nextSequenceId } from '../services/sequenceService.js';
import { resolveNursingTarget } from '../services/nursingService.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

const paging = (query: Record<string, unknown>) => {
  const page = Math.max(parseInt(String(query.page ?? ''), 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(String(query.limit ?? ''), 10) || 20, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
};

const patientFilter = <T>(query: Record<string, unknown>): FilterQuery<T> => {
  const filter: Record<string, unknown> = {};
  if (typeof query.patientId === 'string' && query.patientId) filter.patientId = query.patientId;
  if (typeof query.admissionId === 'string' && query.admissionId) {
    filter.admissionId = query.admissionId;
  }
  return filter as FilterQuery<T>;
};

// --- Medication administration ---

const ADMIN_POPULATE = [
  { path: 'patientId', select: 'patientId firstName lastName' },
  { path: 'administeredBy', select: 'firstName lastName role' },
];

interface AdministrationBody {
  patientId?: string;
  consultationId?: string;
  medicineName?: string;
  dosage?: string;
  route?: string;
  status?: 'given' | 'refused' | 'held';
  administeredAt?: string;
  notes?: string;
}

/**
 * POST /api/nursing/administrations
 * Records that a dose reached the patient — or why it did not.
 */
export const createAdministration = asyncHandler(async (req, res) => {
  const body = req.body as AdministrationBody;
  const actor = req.user!;

  const { patient, admission } = await resolveNursingTarget(actor, body.patientId!);

  /**
   * A prescription may be cited as the source of the dose, but the medicine
   * and amount are still taken from the request: the chart records what was
   * actually given, which is not always what was written.
   */
  if (body.consultationId) {
    const consultation = await Consultation.findById(body.consultationId).select('patientId');
    if (!consultation) throw new ApiError(404, 'Consultation not found');
    if (!consultation.patientId.equals(patient._id)) {
      throw new ApiError(400, 'That consultation belongs to a different patient.');
    }
  }

  const administration = await MedicationAdministration.create({
    administrationId: await nextSequenceId('administrationId', 'MAR', 6),
    patientId: patient._id,
    admissionId: admission?._id,
    consultationId: body.consultationId,
    medicineName: body.medicineName,
    dosage: body.dosage,
    route: body.route,
    status: body.status ?? 'given',
    administeredBy: actor._id,
    administeredAt: body.administeredAt ? new Date(body.administeredAt) : new Date(),
    notes: body.notes,
  });

  await administration.populate(ADMIN_POPULATE);

  await req.audit({
    action: 'medication_administered',
    resourceType: 'medication_administration',
    resourceId: administration._id,
    description: `${administration.administrationId}: ${administration.medicineName} ${administration.status} for ${patient.patientId}.`,
    metadata: {
      administrationId: administration.administrationId,
      patientId: patient.patientId,
      status: administration.status,
    },
  });

  res.status(201).json({
    success: true,
    message: 'Administration recorded',
    data: { administration },
  });
});

/** GET /api/nursing/administrations?patientId=&admissionId= */
export const getAdministrations = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paging(req.query);
  const filter = patientFilter<IMedicationAdministration>(req.query);

  const [administrations, total] = await Promise.all([
    MedicationAdministration.find(filter)
      .populate(ADMIN_POPULATE)
      .sort({ administeredAt: -1 })
      .skip(skip)
      .limit(limit),
    MedicationAdministration.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Administrations fetched',
    data: {
      administrations,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    },
  });
});

// --- Nursing notes ---

const NOTE_POPULATE = [
  { path: 'patientId', select: 'patientId firstName lastName' },
  { path: 'authorId', select: 'firstName lastName role' },
];

interface NoteBody {
  patientId?: string;
  category?: 'progress' | 'handover';
  shift?: 'day' | 'evening' | 'night';
  body?: string;
}

/** POST /api/nursing/notes */
export const createNursingNote = asyncHandler(async (req, res) => {
  const body = req.body as NoteBody;
  const actor = req.user!;

  const { patient, admission } = await resolveNursingTarget(actor, body.patientId!);

  const note = await NursingNote.create({
    noteId: await nextSequenceId('nursingNoteId', 'NNO', 6),
    patientId: patient._id,
    admissionId: admission?._id,
    authorId: actor._id,
    category: body.category ?? 'progress',
    shift: body.shift,
    body: body.body,
  });

  await note.populate(NOTE_POPULATE);

  await req.audit({
    action: 'nursing_note_added',
    resourceType: 'nursing_note',
    resourceId: note._id,
    // The note's text is clinical free text and stays out of the audit trail.
    description: `${note.noteId}: ${note.category} note added for ${patient.patientId}.`,
    metadata: {
      noteId: note.noteId,
      patientId: patient.patientId,
      category: note.category,
      shift: note.shift,
    },
  });

  res.status(201).json({ success: true, message: 'Note added', data: { note } });
});

/** GET /api/nursing/notes?patientId=&admissionId=&category= */
export const getNursingNotes = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paging(req.query);
  const filter = patientFilter<INursingNote>(req.query);
  if (req.query.category === 'progress' || req.query.category === 'handover') {
    (filter as Record<string, unknown>).category = req.query.category;
  }

  const [notes, total] = await Promise.all([
    NursingNote.find(filter).populate(NOTE_POPULATE).sort({ createdAt: -1 }).skip(skip).limit(limit),
    NursingNote.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Notes fetched',
    data: {
      notes,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    },
  });
});
