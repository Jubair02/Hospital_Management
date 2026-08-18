import type { FilterQuery, PipelineStage } from 'mongoose';
import Medicine, { type IMedicine } from '../models/Medicine.js';
import MedicineCategory from '../models/MedicineCategory.js';
import InventoryBatch, { type IInventoryBatch } from '../models/InventoryBatch.js';
import StockTransaction, { type IStockTransaction, type TransactionType } from '../models/StockTransaction.js';
import PrescriptionFulfillment from '../models/PrescriptionFulfillment.js';
import DispensingRecord, { type IDispensingRecord } from '../models/DispensingRecord.js';
import Consultation, { type IConsultation } from '../models/Consultation.js';
import Patient from '../models/Patient.js';
import {
  stockIn,
  adjustStock,
  dispense,
  getPharmacyStats,
  stockLookupStages,
  prescriptionFulfillmentStates,
  nextCategoryId,
  nextMedicineId,
  type DispenseInput,
  type StockInInput,
} from '../services/pharmacyService.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { escapeRegex } from '../utils/escapeRegex.js';

const queryString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;


const paging = (query: Record<string, unknown>) => {
  const page = Math.max(parseInt(queryString(query.page) ?? '', 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(queryString(query.limit) ?? '', 10) || 10, 1), 100);
  return { page, limit };
};

const paginationMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.max(Math.ceil(total / limit), 1),
});

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const getCategories = asyncHandler(async (_req, res) => {
  const categories = await MedicineCategory.find({}).sort({ name: 1 });
  res.json({ success: true, message: 'Categories fetched', data: { categories } });
});

export const createCategory = asyncHandler(async (req, res) => {
  const { name, description } = req.body as { name: string; description?: string };

  const category = await MedicineCategory.create({
    categoryId: await nextCategoryId(),
    name,
    description,
  });

  res.status(201).json({ success: true, message: 'Category created', data: { category } });
});

export const updateCategory = asyncHandler(async (req, res) => {
  const category = await MedicineCategory.findById(req.params.id);
  if (!category) throw new ApiError(404, 'Category not found');

  const { name, description } = req.body as { name?: string; description?: string };
  if (name !== undefined) category.name = name;
  if (description !== undefined) category.description = description;
  await category.save();

  res.json({ success: true, message: 'Category updated', data: { category } });
});

export const updateCategoryStatus = asyncHandler(async (req, res) => {
  const category = await MedicineCategory.findById(req.params.id);
  if (!category) throw new ApiError(404, 'Category not found');

  category.status = (req.body as { status: 'active' | 'inactive' }).status;
  await category.save();

  res.json({ success: true, message: `Category ${category.status}`, data: { category } });
});

// ---------------------------------------------------------------------------
// Medicines
// ---------------------------------------------------------------------------

export const getMedicines = asyncHandler(async (req, res) => {
  const { page, limit } = paging(req.query as Record<string, unknown>);

  const filter: FilterQuery<IMedicine> = {};

  const category = queryString(req.query.category);
  if (category) filter.category = category;

  const status = queryString(req.query.status);
  if (status === 'active' || status === 'inactive') filter.status = status;

  const search = queryString(req.query.search);
  if (search) {
    const rx = { $regex: escapeRegex(search.trim()), $options: 'i' };
    filter.$or = [{ medicineId: rx }, { name: rx }, { genericName: rx }, { brandName: rx }];
  }

  const stockFilter = queryString(req.query.stock); // 'low'

  const pipeline: PipelineStage[] = [
    { $match: filter },
    ...stockLookupStages(),
    ...(stockFilter === 'low' ? [{ $match: { lowStock: true } } as PipelineStage] : []),
    { $sort: { name: 1 as const } },
    {
      $facet: {
        rows: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $lookup: {
              from: 'medicinecategories',
              localField: 'category',
              foreignField: '_id',
              as: 'category',
            },
          },
          { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ];

  const [result] = await Medicine.aggregate(pipeline);
  const rows = (result?.rows ?? []) as unknown[];
  const total = ((result?.total?.[0] as { count?: number } | undefined)?.count ?? 0) as number;

  res.json({
    success: true,
    message: 'Medicines fetched',
    data: { medicines: rows, pagination: paginationMeta(page, limit, total) },
  });
});

export const createMedicine = asyncHandler(async (req, res) => {
  const body = req.body as Partial<IMedicine> & { category: string };

  const category = await MedicineCategory.findById(body.category);
  if (!category) throw new ApiError(404, 'Category not found');
  if (category.status !== 'active') {
    throw new ApiError(400, 'Medicines cannot be added to an inactive category.');
  }

  const medicine = await Medicine.create({
    medicineId: await nextMedicineId(),
    name: body.name,
    genericName: body.genericName,
    brandName: body.brandName,
    category: category._id,
    dosageForm: body.dosageForm,
    strength: body.strength,
    manufacturer: body.manufacturer,
    prescriptionRequired: body.prescriptionRequired,
    reorderLevel: body.reorderLevel,
  });
  await medicine.populate('category', 'categoryId name status');

  res.status(201).json({ success: true, message: 'Medicine created', data: { medicine } });
});

export const getMedicineById = asyncHandler(async (req, res) => {
  const medicine = await Medicine.findById(req.params.id).populate(
    'category',
    'categoryId name status'
  );
  if (!medicine) throw new ApiError(404, 'Medicine not found');

  const batches = await InventoryBatch.find({ medicineId: medicine._id }).sort({ expiryDate: 1 });

  res.json({ success: true, message: 'Medicine fetched', data: { medicine, batches } });
});

export const updateMedicine = asyncHandler(async (req, res) => {
  const medicine = await Medicine.findById(req.params.id);
  if (!medicine) throw new ApiError(404, 'Medicine not found');

  const body = req.body as Partial<IMedicine> & { category?: string };

  if (body.category !== undefined) {
    const category = await MedicineCategory.findById(body.category);
    if (!category) throw new ApiError(404, 'Category not found');
    if (category.status !== 'active') {
      throw new ApiError(400, 'Medicines cannot be moved to an inactive category.');
    }
  }

  const editable = [
    'name',
    'genericName',
    'brandName',
    'category',
    'dosageForm',
    'strength',
    'manufacturer',
    'prescriptionRequired',
    'reorderLevel',
  ] as const;

  for (const field of editable) {
    if (body[field] !== undefined) medicine.set(field, body[field]);
  }
  await medicine.save();
  await medicine.populate('category', 'categoryId name status');

  res.json({ success: true, message: 'Medicine updated', data: { medicine } });
});

export const updateMedicineStatus = asyncHandler(async (req, res) => {
  const medicine = await Medicine.findById(req.params.id);
  if (!medicine) throw new ApiError(404, 'Medicine not found');

  medicine.status = (req.body as { status: 'active' | 'inactive' }).status;
  await medicine.save();

  res.json({ success: true, message: `Medicine ${medicine.status}`, data: { medicine } });
});

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export const getInventory = asyncHandler(async (req, res) => {
  const { page, limit } = paging(req.query as Record<string, unknown>);

  const filter: FilterQuery<IInventoryBatch> = {};

  const medicineId = queryString(req.query.medicineId);
  if (medicineId) filter.medicineId = medicineId;

  const now = new Date();
  const view = queryString(req.query.view);
  if (view === 'expired') {
    filter.expiryDate = { $lte: now };
    filter.quantity = { $gt: 0 };
  } else if (view === 'expiring_soon') {
    const soon = new Date(now);
    soon.setDate(soon.getDate() + 30);
    filter.expiryDate = { $gt: now, $lte: soon };
    filter.quantity = { $gt: 0 };
  } else if (view === 'depleted') {
    filter.quantity = 0;
  } else if (view === 'in_stock') {
    filter.expiryDate = { $gt: now };
    filter.quantity = { $gt: 0 };
  }

  const [batches, total] = await Promise.all([
    InventoryBatch.find(filter)
      .populate('medicineId', 'medicineId name strength dosageForm reorderLevel status')
      .sort({ expiryDate: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    InventoryBatch.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Inventory fetched',
    data: { batches, pagination: paginationMeta(page, limit, total) },
  });
});

export const postStockIn = asyncHandler(async (req, res) => {
  const batch = await stockIn(req.body as StockInInput, req.user!._id);

  await req.audit({
    action: 'stock_received',
    resourceType: 'inventory',
    resourceId: batch._id,
    description: `Received ${batch.quantity} unit(s) as batch ${batch.batchNumber}.`,
    metadata: { batchId: batch.batchId, quantity: batch.quantity },
  });

  await batch.populate('medicineId', 'medicineId name strength dosageForm');

  res.status(201).json({ success: true, message: 'Stock received', data: { batch } });
});

export const postAdjustment = asyncHandler(async (req, res) => {
  const body = req.body as { quantityChange: number; type?: TransactionType; notes?: string };

  const batch = await adjustStock(
    req.params.id as string,
    body.quantityChange,
    body.type ?? 'adjustment',
    body.notes,
    req.user!._id
  );

  await req.audit({
    action: 'stock_adjusted',
    resourceType: 'inventory',
    resourceId: batch._id,
    description: `Adjusted batch ${batch.batchNumber} by ${body.quantityChange} to ${batch.quantity}.`,
    metadata: {
      batchId: batch.batchId,
      change: body.quantityChange,
      balance: batch.quantity,
      type: body.type ?? 'adjustment',
    },
  });

  await batch.populate('medicineId', 'medicineId name strength dosageForm');

  res.json({ success: true, message: 'Stock adjusted', data: { batch } });
});

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export const getTransactions = asyncHandler(async (req, res) => {
  const { page, limit } = paging(req.query as Record<string, unknown>);

  const filter: FilterQuery<IStockTransaction> = {};
  const type = queryString(req.query.type);
  if (type) filter.type = type as TransactionType;
  const medicineId = queryString(req.query.medicineId);
  if (medicineId) filter.medicineId = medicineId;
  const batchId = queryString(req.query.batchId);
  if (batchId) filter.batchId = batchId;

  const [transactions, total] = await Promise.all([
    StockTransaction.find(filter)
      .populate('medicineId', 'medicineId name')
      .populate('batchId', 'batchId batchNumber')
      .populate('performedBy', 'firstName lastName role')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    StockTransaction.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Transactions fetched',
    data: { transactions, pagination: paginationMeta(page, limit, total) },
  });
});

// ---------------------------------------------------------------------------
// Pharmacy prescriptions (read-only clinical data + fulfillment state)
// ---------------------------------------------------------------------------

const RX_POPULATE = [
  { path: 'patientId', select: 'patientId firstName lastName phone' },
  { path: 'doctorId', select: 'doctorId firstName lastName specialization' },
];

export const getPharmacyPrescriptions = asyncHandler(async (req, res) => {
  const { page, limit } = paging(req.query as Record<string, unknown>);

  const filter: FilterQuery<IConsultation> = {
    status: 'completed',
    'prescriptions.0': { $exists: true },
  };

  const search = queryString(req.query.search);
  if (search) {
    const rx = { $regex: escapeRegex(search.trim()), $options: 'i' };
    const patients = await Patient.find({
      $or: [{ patientId: rx }, { firstName: rx }, { lastName: rx }],
    })
      .select('_id')
      .limit(200)
      .lean();
    filter.$or = [
      { consultationId: rx },
      { patientId: { $in: patients.map((p) => p._id) } },
    ];
  }

  /**
   * Optional narrowing by how much of the prescription has actually gone out.
   *
   * Fulfillment lives in its own collection, one row per prescription LINE, so
   * "is this prescription finished" is a comparison between a count of those
   * rows and the number of lines on the consultation — not a field anything
   * could be matched on. Without this the endpoint could only return every
   * completed prescription ever dispensed, which made a dispensing queue
   * impossible to express: the caller got finished work mixed in and no
   * trustworthy count of what was outstanding.
   *
   * Resolved to a set of ids and handed to the ordinary query below, so the
   * populate, sort, and pagination that already worked keep working.
   */
  const wanted = queryString(req.query.fulfillment);
  if (wanted) {
    if (!['pending', 'partial', 'dispensed', 'outstanding'].includes(wanted)) {
      throw new ApiError(
        400,
        'fulfillment must be one of: pending, partial, dispensed, outstanding.'
      );
    }

    const states = await prescriptionFulfillmentStates();

    // "outstanding" is the queue: anything a pharmacist still has work on.
    const matches = states.filter((entry) =>
      wanted === 'outstanding' ? entry.state !== 'dispensed' : entry.state === wanted
    );
    filter._id = { $in: matches.map((entry) => entry._id) };
  }

  const [consultations, total] = await Promise.all([
    Consultation.find(filter)
      .populate(RX_POPULATE)
      .select('consultationId consultationDate prescriptions patientId doctorId status')
      .sort({ consultationDate: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Consultation.countDocuments(filter),
  ]);

  // Fulfillment state for the page's consultations.
  const fulfillments = await PrescriptionFulfillment.find({
    consultationId: { $in: consultations.map((c) => c._id) },
  }).lean();

  res.json({
    success: true,
    message: 'Prescriptions fetched',
    data: { consultations, fulfillments, pagination: paginationMeta(page, limit, total) },
  });
});

export const getPharmacyPrescriptionById = asyncHandler(async (req, res) => {
  const consultation = await Consultation.findById(req.params.id)
    .populate(RX_POPULATE)
    .select('consultationId consultationDate prescriptions patientId doctorId status');

  if (!consultation || consultation.status !== 'completed') {
    throw new ApiError(404, 'No dispensable prescription found for this consultation.');
  }

  const [fulfillments, dispensings] = await Promise.all([
    PrescriptionFulfillment.find({ consultationId: consultation._id }).lean(),
    DispensingRecord.find({ consultationId: consultation._id })
      .populate('dispensedBy', 'firstName lastName')
      .sort({ createdAt: -1 }),
  ]);

  res.json({
    success: true,
    message: 'Prescription fetched',
    data: { consultation, fulfillments, dispensings },
  });
});

// ---------------------------------------------------------------------------
// Dispensing
// ---------------------------------------------------------------------------

export const postDispense = asyncHandler(async (req, res) => {
  const record = await dispense(req.body as DispenseInput, req.user!._id);

  await req.audit({
    action: 'medicine_dispensed',
    resourceType: 'medicine',
    resourceId: record._id,
    description: `Dispensed ${record.items.length} prescription line(s) as ${record.dispensingId}.`,
    metadata: { dispensingId: record.dispensingId, lines: record.items.length },
  });

  await record.populate([
    { path: 'patientId', select: 'patientId firstName lastName' },
    { path: 'consultationId', select: 'consultationId' },
    { path: 'dispensedBy', select: 'firstName lastName' },
  ]);

  res.status(201).json({ success: true, message: 'Medicines dispensed', data: { record } });
});

export const getDispensings = asyncHandler(async (req, res) => {
  const { page, limit } = paging(req.query as Record<string, unknown>);

  const filter: FilterQuery<IDispensingRecord> = {};
  const consultationId = queryString(req.query.consultationId);
  if (consultationId) filter.consultationId = consultationId;
  const patientId = queryString(req.query.patientId);
  if (patientId) filter.patientId = patientId;

  const [records, total] = await Promise.all([
    DispensingRecord.find(filter)
      .populate('patientId', 'patientId firstName lastName')
      .populate('consultationId', 'consultationId')
      .populate('dispensedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    DispensingRecord.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Dispensing history fetched',
    data: { records, pagination: paginationMeta(page, limit, total) },
  });
});

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export const getStats = asyncHandler(async (_req, res) => {
  const stats = await getPharmacyStats();
  res.json({ success: true, message: 'Pharmacy statistics fetched', data: stats });
});
