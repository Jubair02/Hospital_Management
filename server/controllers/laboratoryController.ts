import type { FilterQuery, Types } from 'mongoose';
import LabCategory from '../models/LabCategory.js';
import LabTest, { type ILabTest } from '../models/LabTest.js';
import LabOrder, { type ILabOrder } from '../models/LabOrder.js';
import LabSample, { type ILabSample } from '../models/LabSample.js';
import LabResult from '../models/LabResult.js';
import Doctor from '../models/Doctor.js';
import Patient from '../models/Patient.js';
import {
  createLabOrder,
  collectSample,
  rejectSample,
  enterResult,
  verifyResult,
  cancelLabOrder,
  getLaboratoryStats,
  nextLabCategoryId,
  nextLabTestId,
  type CreateLabOrderInput,
  type EnterResultInput,
} from '../services/laboratoryService.js';
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

const ORDER_POPULATE = [
  { path: 'patientId', select: 'patientId firstName lastName phone gender dateOfBirth' },
  { path: 'doctorId', select: 'doctorId firstName lastName specialization' },
  { path: 'consultationId', select: 'consultationId' },
];

interface Actor {
  _id: Types.ObjectId;
  role: string;
}

/**
 * Lab-order visibility (mirrors the clinical-record rules):
 *  admin + lab_technician — everything; doctor — own orders plus
 *  completed ones; nurse — completed only.
 */
const orderVisibility = async (actor: Actor): Promise<FilterQuery<ILabOrder>> => {
  if (actor.role === 'admin' || actor.role === 'lab_technician') return {};

  if (actor.role === 'doctor') {
    const profile = await Doctor.findOne({ userId: actor._id }).select('_id');
    if (!profile) return { status: 'completed' };
    return { $or: [{ doctorId: profile._id }, { status: 'completed' }] };
  }

  // nurse
  return { status: 'completed' };
};

const canSeeOrder = async (actor: Actor, order: ILabOrder): Promise<boolean> => {
  if (actor.role === 'admin' || actor.role === 'lab_technician') return true;
  if (order.status === 'completed') return true;

  if (actor.role === 'doctor') {
    const profile = await Doctor.findOne({ userId: actor._id }).select('_id');
    const ref = order.doctorId as unknown as { _id: Types.ObjectId };
    return Boolean(profile && ref && profile._id.equals(ref._id));
  }

  return false;
};

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const getLabCategories = asyncHandler(async (req, res) => {
  const filter: FilterQuery<{ name: string }> = {};
  const search = queryString(req.query.search);
  if (search) filter.name = { $regex: escapeRegex(search.trim()), $options: 'i' };

  const categories = await LabCategory.find(filter).sort({ name: 1 });
  res.json({ success: true, message: 'Lab categories fetched', data: { categories } });
});

export const createLabCategory = asyncHandler(async (req, res) => {
  const { name, description } = req.body as { name: string; description?: string };
  const category = await LabCategory.create({
    categoryId: await nextLabCategoryId(),
    name,
    description,
  });
  res.status(201).json({ success: true, message: 'Lab category created', data: { category } });
});

export const updateLabCategory = asyncHandler(async (req, res) => {
  const category = await LabCategory.findById(req.params.id);
  if (!category) throw new ApiError(404, 'Category not found');

  const { name, description } = req.body as { name?: string; description?: string };
  if (name !== undefined) category.name = name;
  if (description !== undefined) category.description = description;
  await category.save();

  res.json({ success: true, message: 'Lab category updated', data: { category } });
});

export const updateLabCategoryStatus = asyncHandler(async (req, res) => {
  const category = await LabCategory.findById(req.params.id);
  if (!category) throw new ApiError(404, 'Category not found');

  category.status = (req.body as { status: 'active' | 'inactive' }).status;
  await category.save();

  res.json({ success: true, message: `Category ${category.status}`, data: { category } });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

export const getLabTests = asyncHandler(async (req, res) => {
  const { page, limit } = paging(req.query as Record<string, unknown>);

  const filter: FilterQuery<ILabTest> = {};
  const category = queryString(req.query.category);
  if (category) filter.category = category;
  const status = queryString(req.query.status);
  if (status === 'active' || status === 'inactive') filter.status = status;
  const sampleType = queryString(req.query.sampleType);
  if (sampleType) filter.sampleType = sampleType as ILabTest['sampleType'];

  const search = queryString(req.query.search);
  if (search) {
    const rx = { $regex: escapeRegex(search.trim()), $options: 'i' };
    filter.$or = [{ testId: rx }, { name: rx }];
  }

  const [tests, total] = await Promise.all([
    LabTest.find(filter)
      .populate('category', 'categoryId name status')
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    LabTest.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Lab tests fetched',
    data: { tests, pagination: meta(page, limit, total) },
  });
});

export const createLabTest = asyncHandler(async (req, res) => {
  const body = req.body as Partial<ILabTest> & { category: string };

  const category = await LabCategory.findById(body.category);
  if (!category) throw new ApiError(404, 'Category not found');
  if (category.status !== 'active') {
    throw new ApiError(400, 'Tests cannot be added to an inactive category.');
  }

  const test = await LabTest.create({
    testId: await nextLabTestId(),
    name: body.name,
    category: category._id,
    description: body.description,
    sampleType: body.sampleType,
    preparationInstructions: body.preparationInstructions,
    price: body.price,
    turnaroundTime: body.turnaroundTime,
    resultType: body.resultType,
    unit: body.unit,
    referenceRange: body.referenceRange,
  });
  await test.populate('category', 'categoryId name status');

  res.status(201).json({ success: true, message: 'Lab test created', data: { test } });
});

export const updateLabTest = asyncHandler(async (req, res) => {
  const test = await LabTest.findById(req.params.id);
  if (!test) throw new ApiError(404, 'Lab test not found');

  const body = req.body as Partial<ILabTest> & { category?: string };

  if (body.category !== undefined) {
    const category = await LabCategory.findById(body.category);
    if (!category) throw new ApiError(404, 'Category not found');
    if (category.status !== 'active') {
      throw new ApiError(400, 'Tests cannot be moved to an inactive category.');
    }
  }

  const editable = [
    'name',
    'category',
    'description',
    'sampleType',
    'preparationInstructions',
    'price',
    'turnaroundTime',
    'resultType',
    'unit',
    'referenceRange',
  ] as const;
  for (const field of editable) {
    if (body[field] !== undefined) test.set(field, body[field]);
  }
  await test.save();
  await test.populate('category', 'categoryId name status');

  res.json({ success: true, message: 'Lab test updated', data: { test } });
});

export const updateLabTestStatus = asyncHandler(async (req, res) => {
  const test = await LabTest.findById(req.params.id);
  if (!test) throw new ApiError(404, 'Lab test not found');

  test.status = (req.body as { status: 'active' | 'inactive' }).status;
  await test.save();

  res.json({ success: true, message: `Lab test ${test.status}`, data: { test } });
});

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export const postLabOrder = asyncHandler(async (req, res) => {
  const order = await createLabOrder(req.body as CreateLabOrderInput, req.user!._id);
  await order.populate(ORDER_POPULATE);

  res.status(201).json({ success: true, message: 'Lab order created', data: { order } });
});

export const getLabOrders = asyncHandler(async (req, res) => {
  const { page, limit } = paging(req.query as Record<string, unknown>);

  const filter: FilterQuery<ILabOrder> = { ...(await orderVisibility(req.user!)) };

  const status = queryString(req.query.status);
  if (status) filter.status = status as ILabOrder['status'];
  const priority = queryString(req.query.priority);
  if (priority) filter.priority = priority as ILabOrder['priority'];
  const patientId = queryString(req.query.patientId);
  if (patientId) filter.patientId = patientId;
  const doctorId = queryString(req.query.doctorId);
  if (doctorId && !filter.$or) filter.doctorId = doctorId;
  const consultationId = queryString(req.query.consultationId);
  if (consultationId) filter.consultationId = consultationId;

  const dateFrom = queryString(req.query.dateFrom);
  const dateTo = queryString(req.query.dateTo);
  if ((dateFrom && DATE_RE.test(dateFrom)) || (dateTo && DATE_RE.test(dateTo))) {
    const to = dateTo && DATE_RE.test(dateTo) ? toCalendarDate(dateTo) : undefined;
    if (to) to.setUTCDate(to.getUTCDate() + 1);
    filter.orderedAt = {
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
    const searchOr = [{ orderId: rx }, { patientId: { $in: patients.map((p) => p._id) } }];
    // Combine with any visibility $or without clobbering it.
    filter.$and = [...(filter.$and ?? []), { $or: searchOr }];
  }

  const [orders, total] = await Promise.all([
    LabOrder.find(filter)
      .populate(ORDER_POPULATE)
      .sort({ orderedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    LabOrder.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Lab orders fetched',
    data: { orders, pagination: meta(page, limit, total) },
  });
});

export const getLabOrderById = asyncHandler(async (req, res) => {
  const order = await LabOrder.findById(req.params.id).populate(ORDER_POPULATE);
  if (!order) throw new ApiError(404, 'Lab order not found');

  if (!(await canSeeOrder(req.user!, order))) {
    throw new ApiError(403, 'You do not have access to this lab order.');
  }

  const [samples, results] = await Promise.all([
    LabSample.find({ orderId: order._id }).populate('collectedBy', 'firstName lastName'),
    LabResult.find({ orderId: order._id })
      .populate('performedBy', 'firstName lastName')
      .populate('verifiedBy', 'firstName lastName'),
  ]);

  res.json({
    success: true,
    message: 'Lab order fetched',
    data: { order, samples, results },
  });
});

export const patchLabOrderStatus = asyncHandler(async (req, res) => {
  // validateCancelOrder guarantees status === 'cancelled'.
  const order = await cancelLabOrder(req.params.id as string);
  await order.populate(ORDER_POPULATE);

  res.json({ success: true, message: 'Lab order cancelled', data: { order } });
});

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------

export const getLabSamples = asyncHandler(async (req, res) => {
  const { page, limit } = paging(req.query as Record<string, unknown>);

  const filter: FilterQuery<ILabSample> = {};
  const status = queryString(req.query.status);
  if (status) filter.status = status as ILabSample['status'];
  const orderId = queryString(req.query.orderId);
  if (orderId) filter.orderId = orderId;

  const [samples, total] = await Promise.all([
    LabSample.find(filter)
      .populate({ path: 'orderId', select: 'orderId priority status' })
      .populate('patientId', 'patientId firstName lastName')
      .populate('collectedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    LabSample.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Samples fetched',
    data: { samples, pagination: meta(page, limit, total) },
  });
});

export const patchCollectSample = asyncHandler(async (req, res) => {
  const sample = await collectSample(
    req.params.id as string,
    (req.body as { notes?: string }).notes,
    req.user!._id
  );

  res.json({ success: true, message: 'Sample collected', data: { sample } });
});

export const patchRejectSample = asyncHandler(async (req, res) => {
  const sample = await rejectSample(
    req.params.id as string,
    (req.body as { reason: string }).reason
  );

  res.json({ success: true, message: 'Sample rejected', data: { sample } });
});

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export const getLabResults = asyncHandler(async (req, res) => {
  const { page, limit } = paging(req.query as Record<string, unknown>);

  const filter: FilterQuery<{ status: string; orderId: unknown; patientId: unknown }> = {};
  const status = queryString(req.query.status);
  if (status) filter.status = status;
  const orderId = queryString(req.query.orderId);
  if (orderId) filter.orderId = orderId;
  const patientId = queryString(req.query.patientId);
  if (patientId) filter.patientId = patientId;

  const [results, total] = await Promise.all([
    LabResult.find(filter)
      .populate({ path: 'orderId', select: 'orderId priority status' })
      .populate('patientId', 'patientId firstName lastName')
      .populate('performedBy', 'firstName lastName')
      .populate('verifiedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    LabResult.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Results fetched',
    data: { results, pagination: meta(page, limit, total) },
  });
});

export const patchEnterResult = asyncHandler(async (req, res) => {
  const result = await enterResult(
    req.params.id as string,
    req.body as EnterResultInput,
    req.user!._id
  );

  await req.audit({
    action: 'lab_result_entered',
    resourceType: 'lab_result',
    resourceId: result._id,
    description: `Recorded a result for ${result.resultId} (${result.testName}).`,
    metadata: { resultId: result.resultId },
  });

  res.json({ success: true, message: 'Result recorded', data: { result } });
});

export const patchVerifyResult = asyncHandler(async (req, res) => {
  const result = await verifyResult(req.params.id as string, req.user!._id);

  await req.audit({
    action: 'lab_result_verified',
    resourceType: 'lab_result',
    resourceId: result._id,
    // The result VALUE is clinical data and is deliberately not recorded.
    description: `Verified result ${result.resultId} (${result.testName}).`,
    metadata: { resultId: result.resultId, orderId: String(result.orderId) },
  });

  res.json({ success: true, message: 'Result verified', data: { result } });
});

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export const getStats = asyncHandler(async (_req, res) => {
  const stats = await getLaboratoryStats();
  res.json({ success: true, message: 'Laboratory statistics fetched', data: stats });
});
