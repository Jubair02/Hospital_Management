import type { Types } from 'mongoose';
import LabTest, { type LabTestDocument } from '../models/LabTest.js';
import LabOrder, {
  CANCELLABLE_STATUSES,
  type LabOrderDocument,
  type LabPriority,
} from '../models/LabOrder.js';
import LabSample, { type LabSampleDocument } from '../models/LabSample.js';
import LabResult, { type LabResultDocument } from '../models/LabResult.js';
import Consultation from '../models/Consultation.js';
import Patient from '../models/Patient.js';
import { requireDoctorProfile } from './consultationService.js';
import { nextSequenceId } from './sequenceService.js';
import { notifyDoctor, notifyPatient, notifyRoles } from './notificationService.js';
import ApiError from '../utils/ApiError.js';

export const nextLabCategoryId = (): Promise<string> => nextSequenceId('labCategoryId', 'LCAT', 3);
export const nextLabTestId = (): Promise<string> => nextSequenceId('labTestId', 'LAB', 4);
export const nextLabOrderId = (): Promise<string> => nextSequenceId('labOrderId', 'ORD', 6);
export const nextLabSampleId = (): Promise<string> => nextSequenceId('labSampleId', 'SMP', 6);
export const nextLabResultId = (): Promise<string> => nextSequenceId('labResultId', 'RES', 6);

// ---------------------------------------------------------------------------
// Ordering (doctor, own consultation — relations derived server-side)
// ---------------------------------------------------------------------------

export interface CreateLabOrderInput {
  consultationId: string;
  tests: string[];
  clinicalNotes?: string;
  priority?: LabPriority;
}

export const createLabOrder = async (
  input: CreateLabOrderInput,
  actorUserId: Types.ObjectId
): Promise<LabOrderDocument> => {
  const consultation = await Consultation.findById(input.consultationId);
  if (!consultation) throw new ApiError(404, 'Consultation not found');
  if (consultation.status === 'cancelled') {
    throw new ApiError(400, 'Lab tests cannot be ordered from a cancelled consultation.');
  }

  // Ownership: only the consultation's doctor may order for it.
  const profile = await requireDoctorProfile(actorUserId);
  if (!consultation.doctorId.equals(profile._id)) {
    throw new ApiError(403, 'You can only order lab tests for your own consultations.');
  }

  const patient = await Patient.findById(consultation.patientId);
  if (!patient) throw new ApiError(404, 'Patient not found');
  if (patient.status !== 'active') {
    throw new ApiError(400, 'Lab tests cannot be ordered for an inactive patient.');
  }

  const uniqueTestIds = [...new Set(input.tests)];
  const tests = await LabTest.find({ _id: { $in: uniqueTestIds } });
  if (tests.length !== uniqueTestIds.length) {
    throw new ApiError(404, 'One or more selected tests do not exist.');
  }
  const inactive = tests.find((t) => t.status !== 'active');
  if (inactive) {
    throw new ApiError(400, `${inactive.name} is inactive and cannot be ordered.`);
  }

  const order = await LabOrder.create({
    orderId: await nextLabOrderId(),
    patientId: consultation.patientId,
    doctorId: consultation.doctorId,
    appointmentId: consultation.appointmentId,
    consultationId: consultation._id,
    tests: tests.map((t) => ({ testId: t._id, testName: t.name, price: t.price })),
    clinicalNotes: input.clinicalNotes,
    priority: input.priority ?? 'routine',
  });

  // One sample per distinct sample type; one pending result per test.
  const sampleTypes = [...new Set(tests.map((t) => t.sampleType))];
  for (const sampleType of sampleTypes) {
    await LabSample.create({
      sampleId: await nextLabSampleId(),
      orderId: order._id,
      patientId: order.patientId,
      sampleType,
    });
  }

  for (const test of tests) {
    await LabResult.create({
      resultId: await nextLabResultId(),
      orderId: order._id,
      testId: test._id,
      patientId: order.patientId,
      testName: test.name,
      unit: test.unit,
      referenceRange: test.referenceRange,
    });
  }

  // Tell the lab there is work waiting (secondary — cannot fail the order).
  await notifyRoles(['lab_technician'], {
    type: 'system',
    title: order.priority === 'urgent' ? 'Urgent lab order received' : 'New lab order received',
    message: `${order.orderId}: ${tests.map((t) => t.name).join(', ')}.`,
    referenceType: 'lab_order',
    referenceId: order._id,
    dedupeKey: `lab_order:created:${order._id}`,
  });

  return order;
};

// ---------------------------------------------------------------------------
// Sample workflow
// ---------------------------------------------------------------------------

const assertOrderIsWorkable = (order: LabOrderDocument): void => {
  if (order.status === 'cancelled') {
    throw new ApiError(400, 'This order has been cancelled and cannot be processed.');
  }
  if (order.status === 'completed') {
    throw new ApiError(400, 'This order is completed and can no longer be modified.');
  }
};

export const collectSample = async (
  sampleMongoId: string,
  notes: string | undefined,
  actorUserId: Types.ObjectId
): Promise<LabSampleDocument> => {
  const sample = await LabSample.findById(sampleMongoId);
  if (!sample) throw new ApiError(404, 'Sample not found');
  if (sample.status !== 'pending') {
    throw new ApiError(400, `A ${sample.status} sample cannot be collected.`);
  }

  const order = await LabOrder.findById(sample.orderId);
  if (!order) throw new ApiError(404, 'Lab order not found');
  assertOrderIsWorkable(order);

  sample.status = 'collected';
  sample.collectedBy = actorUserId;
  sample.collectedAt = new Date();
  if (notes) sample.notes = notes;
  await sample.save();

  // When every sample of the order is collected, the order advances and
  // its results move to processing.
  const stillPending = await LabSample.exists({ orderId: order._id, status: 'pending' });
  if (!stillPending && order.status === 'ordered') {
    const anyRejected = await LabSample.exists({ orderId: order._id, status: 'rejected' });
    if (!anyRejected) {
      order.status = 'sample_collected';
      await order.save();
      await LabResult.updateMany(
        { orderId: order._id, status: 'pending' },
        { $set: { status: 'processing' } }
      );
    }
  }

  return sample;
};

export const rejectSample = async (
  sampleMongoId: string,
  reason: string
): Promise<LabSampleDocument> => {
  const sample = await LabSample.findById(sampleMongoId);
  if (!sample) throw new ApiError(404, 'Sample not found');
  if (sample.status !== 'pending') {
    throw new ApiError(400, `A ${sample.status} sample cannot be rejected.`);
  }

  const order = await LabOrder.findById(sample.orderId);
  if (!order) throw new ApiError(404, 'Lab order not found');
  assertOrderIsWorkable(order);

  sample.status = 'rejected';
  sample.rejectionReason = reason;
  await sample.save();

  return sample;
};

// ---------------------------------------------------------------------------
// Result workflow
// ---------------------------------------------------------------------------

export interface EnterResultInput {
  value: string;
  unit?: string;
  referenceRange?: string;
  interpretation?: string;
  notes?: string;
}

/** Validates the entered value against the test's configured result type. */
const assertValueMatchesType = (test: LabTestDocument, value: string): void => {
  if (test.resultType === 'numeric' && Number.isNaN(Number(value.trim()))) {
    throw new ApiError(400, `${test.name} expects a numeric result value.`);
  }
  if (
    test.resultType === 'positive_negative' &&
    !['positive', 'negative'].includes(value.trim().toLowerCase())
  ) {
    throw new ApiError(400, `${test.name} expects "positive" or "negative".`);
  }
  if (value.trim().length === 0) {
    throw new ApiError(400, 'A result value is required.');
  }
};

export const enterResult = async (
  resultMongoId: string,
  input: EnterResultInput,
  actorUserId: Types.ObjectId
): Promise<LabResultDocument> => {
  const result = await LabResult.findById(resultMongoId);
  if (!result) throw new ApiError(404, 'Result not found');

  if (result.status === 'verified') {
    throw new ApiError(400, 'Verified results are read-only and cannot be modified.');
  }

  const order = await LabOrder.findById(result.orderId);
  if (!order) throw new ApiError(404, 'Lab order not found');
  assertOrderIsWorkable(order);

  const test = await LabTest.findById(result.testId);
  if (!test) throw new ApiError(404, 'Test definition not found');

  // The sample for this test's type must be collected (not pending or rejected).
  const sample = await LabSample.findOne({ orderId: order._id, sampleType: test.sampleType });
  if (!sample) throw new ApiError(404, 'Sample record not found for this test.');
  if (sample.status === 'rejected') {
    throw new ApiError(400, 'The sample for this test was rejected and cannot be processed.');
  }
  if (sample.status === 'pending') {
    throw new ApiError(400, 'Collect the sample before entering a result.');
  }

  assertValueMatchesType(test, input.value);

  result.value = input.value.trim();
  if (input.unit !== undefined) result.unit = input.unit;
  if (input.referenceRange !== undefined) result.referenceRange = input.referenceRange;
  if (input.interpretation !== undefined) result.interpretation = input.interpretation;
  if (input.notes !== undefined) result.notes = input.notes;
  result.performedBy = actorUserId;
  result.performedAt = new Date();
  result.status = 'completed';
  await result.save();

  if (order.status === 'sample_collected') {
    order.status = 'processing';
    await order.save();
  }

  return result;
};

export const verifyResult = async (
  resultMongoId: string,
  actorUserId: Types.ObjectId
): Promise<LabResultDocument> => {
  const result = await LabResult.findById(resultMongoId);
  if (!result) throw new ApiError(404, 'Result not found');

  if (result.status === 'verified') {
    throw new ApiError(400, 'This result is already verified.');
  }
  if (result.status !== 'completed' || !result.value) {
    throw new ApiError(400, 'A result must have an entered value before verification.');
  }

  const order = await LabOrder.findById(result.orderId);
  if (!order) throw new ApiError(404, 'Lab order not found');
  assertOrderIsWorkable(order);

  result.status = 'verified';
  result.verifiedBy = actorUserId;
  result.verifiedAt = new Date();
  await result.save();

  // The ordering doctor is told as soon as a result is verified.
  await notifyDoctor(order.doctorId, {
    type: 'lab_result',
    title: 'Lab result verified',
    message: `${result.testName}: ${result.value ?? ''}${result.unit ? ` ${result.unit}` : ''} (${order.orderId}).`,
    referenceType: 'lab_result',
    referenceId: result._id,
    dedupeKey: `lab_result:verified:${result._id}`,
  });

  // The patient's portal inbox gets availability only — the VALUE stays
  // on the results page, not in a notification.
  await notifyPatient(order.patientId, {
    type: 'lab_result',
    title: 'Lab result available',
    message: `Your ${result.testName} result for order ${order.orderId} is ready in the portal.`,
    referenceType: 'lab_result',
    referenceId: result._id,
    dedupeKey: `lab_result:verified:patient:${result._id}`,
  });

  // All results verified → the order is completed.
  const unverified = await LabResult.exists({
    orderId: order._id,
    status: { $ne: 'verified' },
  });
  if (!unverified) {
    order.status = 'completed';
    await order.save();
  }

  return result;
};

// ---------------------------------------------------------------------------
// Cancellation (the only direct status change the API accepts)
// ---------------------------------------------------------------------------

export const cancelLabOrder = async (orderMongoId: string): Promise<LabOrderDocument> => {
  const order = await LabOrder.findById(orderMongoId);
  if (!order) throw new ApiError(404, 'Lab order not found');

  if (!CANCELLABLE_STATUSES.includes(order.status)) {
    throw new ApiError(400, `A ${order.status} order cannot be cancelled.`);
  }

  order.status = 'cancelled';
  await order.save();
  return order;
};

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export interface LaboratoryStats {
  pendingOrders: number;
  samplesAwaitingCollection: number;
  testsInProcessing: number;
  completedTests: number;
  urgentOrders: number;
  todaysOrders: number;
}

export const getLaboratoryStats = async (): Promise<LaboratoryStats> => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    pendingOrders,
    samplesAwaitingCollection,
    testsInProcessing,
    completedTests,
    urgentOrders,
    todaysOrders,
  ] = await Promise.all([
    LabOrder.countDocuments({ status: 'ordered' }),
    LabSample.countDocuments({ status: 'pending' }),
    LabResult.countDocuments({ status: 'processing' }),
    LabResult.countDocuments({ status: 'verified' }),
    LabOrder.countDocuments({
      priority: 'urgent',
      status: { $in: ['ordered', 'sample_collected', 'processing'] },
    }),
    LabOrder.countDocuments({ orderedAt: { $gte: startOfDay } }),
  ]);

  return {
    pendingOrders,
    samplesAwaitingCollection,
    testsInProcessing,
    completedTests,
    urgentOrders,
    todaysOrders,
  };
};
