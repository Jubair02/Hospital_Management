import type { FilterQuery, Types } from 'mongoose';
import Ward, { type IWard } from '../models/Ward.js';
import Bed, { type IBed } from '../models/Bed.js';
import Admission, { type IAdmission } from '../models/Admission.js';
import BedTransfer from '../models/BedTransfer.js';
import Doctor from '../models/Doctor.js';
import Patient from '../models/Patient.js';
import {
  admitPatient,
  transferPatient,
  endAdmission,
  getInpatientStats,
  nextWardId,
  nextBedId,
  type AdmitPatientInput,
  type TransferInput,
} from '../services/inpatientService.js';
import { toCalendarDate } from '../services/appointmentService.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { escapeRegex } from '../utils/escapeRegex.js';

const queryString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;


const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const paging = (query: Record<string, unknown>) => {
  const page = Math.max(parseInt(queryString(query.page) ?? '', 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(queryString(query.limit) ?? '', 10) || 10, 1), 100);
  return { page, limit };
};

const meta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.max(Math.ceil(total / limit), 1),
});

const ADMISSION_POPULATE = [
  { path: 'patientId', select: 'patientId firstName lastName phone gender dateOfBirth' },
  { path: 'doctorId', select: 'doctorId firstName lastName specialization' },
  { path: 'wardId', select: 'wardId name type floor' },
  { path: 'bedId', select: 'bedId bedNumber bedType' },
  { path: 'admittedBy', select: 'firstName lastName role' },
];

interface Actor {
  _id: Types.ObjectId;
  role: string;
}

/** Doctors only see admissions where they are the attending doctor. */
const admissionVisibility = async (actor: Actor): Promise<FilterQuery<IAdmission>> => {
  if (actor.role !== 'doctor') return {};
  const profile = await Doctor.findOne({ userId: actor._id }).select('_id');
  return { doctorId: profile?._id ?? null };
};

// ---------------------------------------------------------------------------
// Wards
// ---------------------------------------------------------------------------

export const getWards = asyncHandler(async (req, res) => {
  const { page, limit } = paging(req.query as Record<string, unknown>);

  const filter: FilterQuery<IWard> = {};
  const type = queryString(req.query.type);
  if (type) filter.type = type as IWard['type'];
  const status = queryString(req.query.status);
  if (status === 'active' || status === 'inactive') filter.status = status;
  const search = queryString(req.query.search);
  if (search) {
    const rx = { $regex: escapeRegex(search.trim()), $options: 'i' };
    filter.$or = [{ wardId: rx }, { name: rx }];
  }

  const [wards, total] = await Promise.all([
    Ward.find(filter)
      .populate('department', 'departmentId name')
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Ward.countDocuments(filter),
  ]);

  // Bed availability summary per ward on the current page.
  const wardIds = wards.map((w) => w._id);
  const bedCounts = await Bed.aggregate([
    { $match: { wardId: { $in: wardIds } } },
    { $group: { _id: { ward: '$wardId', status: '$status' }, count: { $sum: 1 } } },
  ]);

  const summary = new Map<string, Record<string, number>>();
  for (const row of bedCounts as Array<{ _id: { ward: Types.ObjectId; status: string }; count: number }>) {
    const key = String(row._id.ward);
    const entry = summary.get(key) ?? {};
    entry[row._id.status] = row.count;
    entry.total = (entry.total ?? 0) + row.count;
    summary.set(key, entry);
  }

  res.json({
    success: true,
    message: 'Wards fetched',
    data: {
      wards: wards.map((w) => ({
        ...w.toJSON(),
        bedSummary: summary.get(String(w._id)) ?? { total: 0 },
      })),
      pagination: meta(page, limit, total),
    },
  });
});

export const createWard = asyncHandler(async (req, res) => {
  const body = req.body as Partial<IWard> & { department?: string };

  const ward = await Ward.create({
    wardId: await nextWardId(),
    name: body.name,
    type: body.type,
    department: body.department || undefined,
    floor: body.floor,
    description: body.description,
  });

  res.status(201).json({ success: true, message: 'Ward created', data: { ward } });
});

export const getWardById = asyncHandler(async (req, res) => {
  const ward = await Ward.findById(req.params.id).populate('department', 'departmentId name');
  if (!ward) throw new ApiError(404, 'Ward not found');

  const beds = await Bed.find({ wardId: ward._id })
    .populate('currentPatientId', 'patientId firstName lastName')
    .sort({ bedNumber: 1 });

  res.json({ success: true, message: 'Ward fetched', data: { ward, beds } });
});

export const updateWard = asyncHandler(async (req, res) => {
  const ward = await Ward.findById(req.params.id);
  if (!ward) throw new ApiError(404, 'Ward not found');

  const body = req.body as Partial<IWard> & { department?: string };
  for (const field of ['name', 'type', 'floor', 'description'] as const) {
    if (body[field] !== undefined) ward.set(field, body[field]);
  }
  if (body.department !== undefined) ward.set('department', body.department || undefined);
  await ward.save();

  res.json({ success: true, message: 'Ward updated', data: { ward } });
});

export const updateWardStatus = asyncHandler(async (req, res) => {
  const ward = await Ward.findById(req.params.id);
  if (!ward) throw new ApiError(404, 'Ward not found');

  const { status } = req.body as { status: 'active' | 'inactive' };

  if (status === 'inactive') {
    const occupied = await Bed.countDocuments({ wardId: ward._id, status: 'occupied' });
    if (occupied > 0) {
      throw new ApiError(400, `This ward still has ${occupied} occupied bed(s). Transfer or discharge first.`);
    }
  }

  ward.status = status;
  await ward.save();

  res.json({ success: true, message: `Ward ${status}`, data: { ward } });
});

// ---------------------------------------------------------------------------
// Beds
// ---------------------------------------------------------------------------

export const getBeds = asyncHandler(async (req, res) => {
  const { page, limit } = paging(req.query as Record<string, unknown>);

  const filter: FilterQuery<IBed> = {};
  const wardId = queryString(req.query.wardId);
  if (wardId) filter.wardId = wardId;
  const status = queryString(req.query.status);
  if (status) filter.status = status as IBed['status'];

  const [beds, total] = await Promise.all([
    Bed.find(filter)
      .populate('wardId', 'wardId name type status')
      .populate('currentPatientId', 'patientId firstName lastName')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Bed.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Beds fetched',
    data: { beds, pagination: meta(page, limit, total) },
  });
});

export const createBed = asyncHandler(async (req, res) => {
  const body = req.body as { wardId: string; bedNumber: string; bedType?: string };

  const ward = await Ward.findById(body.wardId);
  if (!ward) throw new ApiError(404, 'Ward not found');

  try {
    const bed = await Bed.create({
      bedId: await nextBedId(),
      wardId: ward._id,
      bedNumber: body.bedNumber,
      bedType: body.bedType,
    });
    await bed.populate('wardId', 'wardId name type status');

    res.status(201).json({ success: true, message: 'Bed created', data: { bed } });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw new ApiError(409, 'This bed number already exists in the ward.');
    }
    throw err;
  }
});

export const updateBed = asyncHandler(async (req, res) => {
  const bed = await Bed.findById(req.params.id);
  if (!bed) throw new ApiError(404, 'Bed not found');
  if (bed.status === 'occupied') {
    throw new ApiError(400, 'Occupied beds cannot be edited. Transfer or discharge first.');
  }

  const body = req.body as { bedNumber?: string; bedType?: string };
  if (body.bedNumber !== undefined) bed.bedNumber = body.bedNumber;
  if (body.bedType !== undefined) bed.bedType = body.bedType;

  try {
    await bed.save();
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw new ApiError(409, 'This bed number already exists in the ward.');
    }
    throw err;
  }

  res.json({ success: true, message: 'Bed updated', data: { bed } });
});

export const updateBedStatus = asyncHandler(async (req, res) => {
  const bed = await Bed.findById(req.params.id);
  if (!bed) throw new ApiError(404, 'Bed not found');

  if (bed.status === 'occupied') {
    throw new ApiError(400, 'Occupied beds change status only via transfer or discharge.');
  }

  bed.status = (req.body as { status: IBed['status'] }).status;
  await bed.save();

  res.json({ success: true, message: `Bed marked ${bed.status}`, data: { bed } });
});

// ---------------------------------------------------------------------------
// Admissions
// ---------------------------------------------------------------------------

export const postAdmission = asyncHandler(async (req, res) => {
  const admission = await admitPatient(req.body as AdmitPatientInput, req.user!._id);

  await req.audit({
    action: 'patient_admitted',
    resourceType: 'admission',
    resourceId: admission._id,
    description: `Admitted patient as ${admission.admissionId}.`,
    metadata: {
      admissionId: admission.admissionId,
      admissionType: admission.admissionType,
      bedId: String(admission.bedId),
    },
  });

  await admission.populate(ADMISSION_POPULATE);

  res.status(201).json({ success: true, message: 'Patient admitted', data: { admission } });
});

export const getAdmissions = asyncHandler(async (req, res) => {
  const { page, limit } = paging(req.query as Record<string, unknown>);

  const filter: FilterQuery<IAdmission> = { ...(await admissionVisibility(req.user!)) };

  const status = queryString(req.query.status);
  if (status) filter.status = status as IAdmission['status'];
  const wardId = queryString(req.query.wardId);
  if (wardId) filter.wardId = wardId;
  const patientId = queryString(req.query.patientId);
  if (patientId) filter.patientId = patientId;
  const doctorId = queryString(req.query.doctorId);
  if (doctorId && req.user!.role !== 'doctor') filter.doctorId = doctorId;

  const dateFrom = queryString(req.query.dateFrom);
  const dateTo = queryString(req.query.dateTo);
  if ((dateFrom && DATE_RE.test(dateFrom)) || (dateTo && DATE_RE.test(dateTo))) {
    const to = dateTo && DATE_RE.test(dateTo) ? toCalendarDate(dateTo) : undefined;
    if (to) to.setUTCDate(to.getUTCDate() + 1);
    filter.admissionDate = {
      ...(dateFrom && DATE_RE.test(dateFrom) ? { $gte: toCalendarDate(dateFrom) } : {}),
      ...(to ? { $lt: to } : {}),
    };
  }

  const search = queryString(req.query.search);
  if (search) {
    const rx = { $regex: escapeRegex(search.trim()), $options: 'i' };
    const patients = await Patient.find({
      $or: [{ patientId: rx }, { firstName: rx }, { lastName: rx }],
    })
      .select('_id')
      .limit(200)
      .lean();
    filter.$or = [{ admissionId: rx }, { patientId: { $in: patients.map((p) => p._id) } }];
  }

  const [admissions, total] = await Promise.all([
    Admission.find(filter)
      .populate(ADMISSION_POPULATE)
      .sort({ admissionDate: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Admission.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Admissions fetched',
    data: { admissions, pagination: meta(page, limit, total) },
  });
});

export const getAdmissionById = asyncHandler(async (req, res) => {
  const admission = await Admission.findById(req.params.id).populate(ADMISSION_POPULATE);
  if (!admission) throw new ApiError(404, 'Admission not found');

  if (req.user!.role === 'doctor') {
    const profile = await Doctor.findOne({ userId: req.user!._id }).select('_id');
    const ref = admission.doctorId as unknown as { _id: Types.ObjectId } | null;
    if (!profile || !ref || !profile._id.equals(ref._id)) {
      throw new ApiError(403, 'You can only view admissions of your own patients.');
    }
  }

  const transfers = await BedTransfer.find({ admissionId: admission._id })
    .populate('fromWardId', 'name')
    .populate('toWardId', 'name')
    .populate('fromBedId', 'bedNumber')
    .populate('toBedId', 'bedNumber')
    .populate('transferredBy', 'firstName lastName')
    .sort({ transferredAt: -1 });

  res.json({ success: true, message: 'Admission fetched', data: { admission, transfers } });
});

// ---------------------------------------------------------------------------
// Transfers & discharge
// ---------------------------------------------------------------------------

export const postTransfer = asyncHandler(async (req, res) => {
  const transfer = await transferPatient(req.body as TransferInput, req.user!._id);

  await req.audit({
    action: 'bed_transferred',
    resourceType: 'admission',
    resourceId: transfer.admissionId,
    description: `Transferred bed for admission via ${transfer.transferId}.`,
    metadata: {
      transferId: transfer.transferId,
      fromBedId: String(transfer.fromBedId),
      toBedId: String(transfer.toBedId),
    },
  });

  await transfer.populate([
    { path: 'fromWardId', select: 'name' },
    { path: 'toWardId', select: 'name' },
    { path: 'fromBedId', select: 'bedNumber' },
    { path: 'toBedId', select: 'bedNumber' },
  ]);

  res.status(201).json({ success: true, message: 'Patient transferred', data: { transfer } });
});

export const getTransfers = asyncHandler(async (req, res) => {
  const { page, limit } = paging(req.query as Record<string, unknown>);

  const filter: FilterQuery<{ admissionId: unknown; patientId: unknown }> = {};
  const admissionId = queryString(req.query.admissionId);
  if (admissionId) filter.admissionId = admissionId;
  const patientId = queryString(req.query.patientId);
  if (patientId) filter.patientId = patientId;

  const [transfers, total] = await Promise.all([
    BedTransfer.find(filter)
      .populate('patientId', 'patientId firstName lastName')
      .populate('fromWardId', 'name')
      .populate('toWardId', 'name')
      .populate('fromBedId', 'bedNumber')
      .populate('toBedId', 'bedNumber')
      .populate('transferredBy', 'firstName lastName')
      .sort({ transferredAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    BedTransfer.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Transfers fetched',
    data: { transfers, pagination: meta(page, limit, total) },
  });
});

export const postDischarge = asyncHandler(async (req, res) => {
  const { admissionId, notes, outcome } = req.body as {
    admissionId: string;
    notes?: string;
    outcome?: 'discharged' | 'cancelled';
  };

  if (outcome === 'cancelled' && req.user!.role !== 'admin') {
    throw new ApiError(403, 'Only administrators can cancel admissions.');
  }

  const admission = await endAdmission(admissionId, outcome ?? 'discharged', notes);

  await req.audit({
    action: 'patient_discharged',
    resourceType: 'admission',
    resourceId: admission._id,
    description: `Admission ${admission.admissionId} ${admission.status}; bed released.`,
    metadata: { admissionId: admission.admissionId, outcome: admission.status },
  });

  await admission.populate(ADMISSION_POPULATE);

  res.json({
    success: true,
    message: `Patient ${admission.status}`,
    data: { admission },
  });
});

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export const getStats = asyncHandler(async (_req, res) => {
  const stats = await getInpatientStats();
  res.json({ success: true, message: 'Inpatient statistics fetched', data: stats });
});
