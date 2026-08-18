import type { PipelineStage, Types } from 'mongoose';
import Medicine from '../models/Medicine.js';
import InventoryBatch, { type InventoryBatchDocument } from '../models/InventoryBatch.js';
import StockTransaction, { type TransactionType } from '../models/StockTransaction.js';
import PrescriptionFulfillment from '../models/PrescriptionFulfillment.js';
import DispensingRecord, { type DispensingRecordDocument } from '../models/DispensingRecord.js';
import Consultation from '../models/Consultation.js';
import ApiError from '../utils/ApiError.js';
import { nextSequenceId } from './sequenceService.js';
import { notifyPatient, notifyRoles } from './notificationService.js';
import { getSetting } from './settingsService.js';

export const nextCategoryId = (): Promise<string> => nextSequenceId('categoryId', 'CAT', 3);
export const nextMedicineId = (): Promise<string> => nextSequenceId('medicineId', 'MED', 5);
export const nextBatchId = (): Promise<string> => nextSequenceId('batchId', 'BAT', 6);
export const nextTransactionId = (): Promise<string> => nextSequenceId('transactionId', 'TXN', 6);
export const nextDispensingId = (): Promise<string> => nextSequenceId('dispensingId', 'DSP', 6);

const recordTransaction = async (
  type: TransactionType,
  batch: { _id: Types.ObjectId; medicineId: Types.ObjectId },
  quantityChange: number,
  balanceAfter: number,
  performedBy: Types.ObjectId,
  extras: { reference?: string; notes?: string } = {}
): Promise<void> => {
  await StockTransaction.create({
    transactionId: await nextTransactionId(),
    type,
    medicineId: batch.medicineId,
    batchId: batch._id,
    quantityChange,
    balanceAfter,
    performedBy,
    ...extras,
  });
};

// ---------------------------------------------------------------------------
// Stock in
// ---------------------------------------------------------------------------

export interface StockInInput {
  medicineId: string;
  batchNumber: string;
  quantity: number;
  unitCost: number;
  sellingPrice: number;
  manufactureDate?: string;
  expiryDate: string;
  notes?: string;
}

export const stockIn = async (
  input: StockInInput,
  actorId: Types.ObjectId
): Promise<InventoryBatchDocument> => {
  const medicine = await Medicine.findById(input.medicineId);
  if (!medicine) throw new ApiError(404, 'Medicine not found');
  if (medicine.status !== 'active') {
    throw new ApiError(400, 'Stock cannot be received for an inactive medicine.');
  }

  const expiry = new Date(`${input.expiryDate}T00:00:00.000Z`);
  if (expiry.getTime() <= Date.now()) {
    throw new ApiError(400, 'Expired stock cannot be received.');
  }

  let batch: InventoryBatchDocument;
  try {
    batch = await InventoryBatch.create({
      batchId: await nextBatchId(),
      medicineId: medicine._id,
      batchNumber: input.batchNumber,
      quantity: input.quantity,
      initialQuantity: input.quantity,
      unitCost: input.unitCost,
      sellingPrice: input.sellingPrice,
      manufactureDate: input.manufactureDate
        ? new Date(`${input.manufactureDate}T00:00:00.000Z`)
        : undefined,
      expiryDate: expiry,
      notes: input.notes,
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw new ApiError(
        409,
        'This batch number already exists for the medicine. Adjust the existing batch instead.'
      );
    }
    throw err;
  }

  await recordTransaction('stock_in', batch, input.quantity, batch.quantity, actorId, {
    notes: input.notes,
  });

  return batch;
};

// ---------------------------------------------------------------------------
// Stock adjustment (adjustment / return / expiry write-off)
// ---------------------------------------------------------------------------

export const ADJUSTMENT_TYPES: TransactionType[] = ['adjustment', 'return', 'expiry'];

export const adjustStock = async (
  batchMongoId: string,
  quantityChange: number,
  type: TransactionType,
  notes: string | undefined,
  actorId: Types.ObjectId
): Promise<InventoryBatchDocument> => {
  const batch = await InventoryBatch.findById(batchMongoId);
  if (!batch) throw new ApiError(404, 'Inventory batch not found');

  // Guarded atomic update: a decrement only succeeds while the batch
  // still holds enough stock, so the quantity can never go negative —
  // even with concurrent dispensing against the same batch.
  const updated = await InventoryBatch.findOneAndUpdate(
    {
      _id: batch._id,
      ...(quantityChange < 0 ? { quantity: { $gte: -quantityChange } } : {}),
    },
    { $inc: { quantity: quantityChange } },
    { new: true }
  );

  if (!updated) {
    throw new ApiError(
      400,
      `This adjustment would make the stock negative (current quantity: ${batch.quantity}).`
    );
  }

  await recordTransaction(type, updated, quantityChange, updated.quantity, actorId, { notes });

  return updated;
};

// ---------------------------------------------------------------------------
// Dispensing (FEFO, atomic, compensating)
// ---------------------------------------------------------------------------

export interface DispenseItemInput {
  prescriptionIndex: number;
  medicineId: string;
  quantity: number;
  /** Required the first time a line is dispensed. */
  prescribedQuantity?: number;
}

export interface DispenseInput {
  consultationId: string;
  items: DispenseItemInput[];
}

interface Allocation {
  batch: InventoryBatchDocument;
  taken: number;
}

interface CompletedItem {
  input: DispenseItemInput;
  medicineName: string;
  fulfillmentId: Types.ObjectId;
  allocations: Allocation[];
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** FEFO allocation with guarded atomic decrements and retry. */
const allocateStock = async (
  medicineId: Types.ObjectId,
  quantity: number
): Promise<Allocation[] | null> => {
  const allocations: Allocation[] = [];
  let remaining = quantity;

  for (let attempt = 0; attempt < 3 && remaining > 0; attempt += 1) {
    if (attempt > 0) await sleep(5 + Math.floor(Math.random() * 15));

    // First Expire, First Out — usable stock only (not expired, not empty).
    const batches = await InventoryBatch.find({
      medicineId,
      quantity: { $gt: 0 },
      expiryDate: { $gt: new Date() },
    }).sort({ expiryDate: 1, _id: 1 });

    for (const candidate of batches) {
      if (remaining <= 0) break;
      const take = Math.min(candidate.quantity, remaining);

      // Succeeds only while the batch still holds `take` units.
      const updated = await InventoryBatch.findOneAndUpdate(
        { _id: candidate._id, quantity: { $gte: take } },
        { $inc: { quantity: -take } },
        { new: true }
      );

      if (updated) {
        allocations.push({ batch: updated, taken: take });
        remaining -= take;
      }
    }
  }

  if (remaining > 0) {
    // Roll back everything taken so far.
    for (const { batch, taken } of allocations) {
      await InventoryBatch.updateOne({ _id: batch._id }, { $inc: { quantity: taken } });
    }
    return null;
  }

  return allocations;
};

/**
 * Dispenses prescription lines with full integrity guarantees:
 *
 *  - The doctor's clinical prescription is never modified; fulfillment
 *    is tracked in a separate pharmacy-owned collection.
 *  - Over-dispensing is impossible: the fulfillment's `remaining` is
 *    decremented with a guarded atomic update.
 *  - Stock can never go negative: every batch decrement is guarded
 *    (quantity >= take) and FEFO only considers non-expired batches.
 *  - Any failure COMPENSATES all prior steps of the request (restores
 *    fulfillment counters and batch quantities) before throwing, so a
 *    rejected dispense leaves no trace.
 *  - Ledger entries and the dispensing record are written only after
 *    every line has succeeded.
 */
export const dispense = async (
  input: DispenseInput,
  actorId: Types.ObjectId
): Promise<DispensingRecordDocument> => {
  const consultation = await Consultation.findById(input.consultationId);
  if (!consultation) throw new ApiError(404, 'Consultation not found');
  if (consultation.status !== 'completed') {
    throw new ApiError(400, 'Only prescriptions of completed consultations can be dispensed.');
  }
  if (consultation.prescriptions.length === 0) {
    throw new ApiError(400, 'This consultation has no prescriptions.');
  }

  const seen = new Set<number>();
  for (const item of input.items) {
    if (item.prescriptionIndex >= consultation.prescriptions.length) {
      throw new ApiError(400, `Prescription line ${item.prescriptionIndex + 1} does not exist.`);
    }
    if (seen.has(item.prescriptionIndex)) {
      throw new ApiError(400, 'Each prescription line may appear only once per dispensing.');
    }
    seen.add(item.prescriptionIndex);
  }

  const completed: CompletedItem[] = [];

  /** Undo every fulfilled step of this request. */
  const compensate = async (): Promise<void> => {
    for (const step of completed.reverse()) {
      for (const { batch, taken } of step.allocations) {
        await InventoryBatch.updateOne({ _id: batch._id }, { $inc: { quantity: taken } });
      }
      await PrescriptionFulfillment.updateOne(
        { _id: step.fulfillmentId },
        { $inc: { remaining: step.input.quantity, dispensedQuantity: -step.input.quantity } }
      );
    }
  };

  try {
    for (const item of input.items) {
      const line = consultation.prescriptions[item.prescriptionIndex]!;

      const medicine = await Medicine.findById(item.medicineId);
      if (!medicine) throw new ApiError(404, `Medicine not found for "${line.medicineName}".`);
      if (medicine.status !== 'active') {
        throw new ApiError(400, `${medicine.name} is inactive and cannot be dispensed.`);
      }

      // Find or create the fulfillment record for this line.
      let fulfillment = await PrescriptionFulfillment.findOne({
        consultationId: consultation._id,
        prescriptionIndex: item.prescriptionIndex,
      });

      if (!fulfillment) {
        const prescribed = item.prescribedQuantity;
        if (!prescribed || prescribed < 1) {
          throw new ApiError(
            400,
            `Set the total prescribed quantity for "${line.medicineName}" on its first dispensing.`
          );
        }
        try {
          fulfillment = await PrescriptionFulfillment.create({
            consultationId: consultation._id,
            prescriptionIndex: item.prescriptionIndex,
            patientId: consultation.patientId,
            medicineId: medicine._id,
            medicineName: line.medicineName,
            prescribedQuantity: prescribed,
            dispensedQuantity: 0,
            remaining: prescribed,
          });
        } catch (err) {
          if ((err as { code?: number }).code !== 11000) throw err;
          // Concurrent first-dispense created it — use the winner's record.
          fulfillment = await PrescriptionFulfillment.findOne({
            consultationId: consultation._id,
            prescriptionIndex: item.prescriptionIndex,
          });
          if (!fulfillment) throw err;
        }
      }

      /**
       * The medicine is fixed at first dispensing.
       *
       * Without this, a later dispensing of the same line could name a
       * different medicine: the fulfillment row still said Paracetamol and
       * counted the units against it, while the stock ledger recorded
       * Cetirizine leaving the shelf. Two records of one event that disagree
       * about what was handed over — and the patient's chart would show the
       * wrong drug dispensed. The UI never offers the choice after the first
       * dispensing, but the API accepted it.
       */
      if (!fulfillment.medicineId.equals(medicine._id)) {
        throw new ApiError(
          400,
          `"${line.medicineName}" was already dispensed as ${fulfillment.medicineName}. Continue with that medicine, or adjust stock separately.`
        );
      }

      // Over-dispensing guard: only succeeds while enough remains.
      const reserved = await PrescriptionFulfillment.findOneAndUpdate(
        { _id: fulfillment._id, remaining: { $gte: item.quantity } },
        { $inc: { remaining: -item.quantity, dispensedQuantity: item.quantity } },
        { new: true }
      );

      if (!reserved) {
        const fresh = await PrescriptionFulfillment.findById(fulfillment._id);
        throw new ApiError(
          400,
          `Over-dispensing blocked for "${line.medicineName}": ${fresh?.remaining ?? 0} of ${
            fresh?.prescribedQuantity ?? 0
          } units remain.`
        );
      }

      // FEFO stock allocation (rolls itself back on failure).
      const allocations = await allocateStock(medicine._id, item.quantity);

      if (!allocations) {
        // Give back the reserved fulfillment quantity, then fail.
        await PrescriptionFulfillment.updateOne(
          { _id: reserved._id },
          { $inc: { remaining: item.quantity, dispensedQuantity: -item.quantity } }
        );
        throw new ApiError(
          400,
          `Insufficient usable (non-expired) stock of ${medicine.name} for "${line.medicineName}".`
        );
      }

      completed.push({
        input: item,
        medicineName: line.medicineName,
        fulfillmentId: reserved._id,
        allocations,
      });
    }
  } catch (err) {
    await compensate();
    throw err;
  }

  // Every line succeeded — settle fulfillment statuses, write the ledger
  // and the dispensing record.
  const dispensingId = await nextDispensingId();

  for (const step of completed) {
    const fresh = await PrescriptionFulfillment.findById(step.fulfillmentId);
    if (fresh) {
      fresh.status = fresh.remaining === 0 ? 'dispensed' : 'partial';
      await fresh.save();
    }

    for (const { batch, taken } of step.allocations) {
      await recordTransaction('dispense', batch, -taken, batch.quantity, actorId, {
        reference: dispensingId,
      });
    }
  }

  // Low-stock watch: one notification per medicine per day (deduped),
  // raised only when dispensing pushed usable stock below the reorder
  // level. Secondary effect — never fails the dispense.
  const today = new Date().toISOString().slice(0, 10);
  const lowStockAlertsEnabled = await getSetting('notifyLowStock');

  for (const step of completed) {
    if (!lowStockAlertsEnabled) break;
    const medicineId = step.allocations[0]!.batch.medicineId;
    const medicine = await Medicine.findById(medicineId).select('name reorderLevel status');
    if (!medicine || medicine.status !== 'active') continue;

    const remainingRows = await InventoryBatch.aggregate([
      { $match: { medicineId, quantity: { $gt: 0 }, expiryDate: { $gt: new Date() } } },
      { $group: { _id: null, total: { $sum: '$quantity' } } },
    ]);
    const usable = (remainingRows[0] as { total?: number } | undefined)?.total ?? 0;

    if (usable < medicine.reorderLevel) {
      await notifyRoles(['pharmacist', 'admin'], {
        type: 'low_stock',
        title: 'Low stock',
        message: `${medicine.name}: ${usable} unit(s) usable, below the reorder level of ${medicine.reorderLevel}.`,
        referenceType: 'medicine',
        referenceId: medicine._id,
        dedupeKey: `low_stock:${medicine._id}:${today}`,
      });
    }
  }

  const record = await DispensingRecord.create({
    dispensingId,
    consultationId: consultation._id,
    patientId: consultation.patientId,
    items: completed.map((step) => ({
      prescriptionIndex: step.input.prescriptionIndex,
      medicineId: step.allocations[0]!.batch.medicineId,
      medicineName: step.medicineName,
      quantity: step.input.quantity,
      batches: step.allocations.map(({ batch, taken }) => ({
        batchId: batch._id,
        batchNumber: batch.batchNumber,
        quantity: taken,
        sellingPrice: batch.sellingPrice,
      })),
    })),
    dispensedBy: actorId,
  });

  // Portal inbox: the patient learns their medicines are ready (no-op
  // without a portal account; failure never fails the dispensing).
  await notifyPatient(consultation.patientId, {
    type: 'prescription',
    title: 'Medicines dispensed',
    message: `${record.items.map((i) => i.medicineName).join(', ')} dispensed (${record.dispensingId}).`,
    referenceType: 'consultation',
    referenceId: consultation._id,
    dedupeKey: `dispensing:created:patient:${record._id}`,
  });

  return record;
};

// ---------------------------------------------------------------------------
// Aggregations & statistics
// ---------------------------------------------------------------------------

/** Pipeline stages that attach `totalStock` (usable units) to medicines. */
export type FulfillmentState = 'pending' | 'partial' | 'dispensed';

/**
 * How far each completed prescription has actually been dispensed.
 *
 * Fulfillment is stored one row per prescription LINE, so "is this prescription
 * finished" is a comparison between a count of those rows and the number of
 * lines the doctor wrote — not a field anything can be matched on. Every caller
 * that needs the answer gets it from here, because the dashboard tile and the
 * dispensing queue disagreeing about how much work is left is worse than either
 * of them being wrong on its own.
 */
export const prescriptionFulfillmentStates = async (): Promise<
  { _id: Types.ObjectId; state: FulfillmentState }[]
> =>
  Consultation.aggregate([
    { $match: { status: 'completed', 'prescriptions.0': { $exists: true } } },
    {
      $lookup: {
        from: PrescriptionFulfillment.collection.name,
        localField: '_id',
        foreignField: 'consultationId',
        as: 'lines',
      },
    },
    {
      $project: {
        lineCount: { $size: '$prescriptions' },
        started: { $size: '$lines' },
        dispensed: {
          $size: {
            $filter: {
              input: '$lines',
              as: 'line',
              cond: { $eq: ['$$line.status', 'dispensed'] },
            },
          },
        },
      },
    },
    {
      $project: {
        state: {
          $switch: {
            branches: [
              { case: { $eq: ['$dispensed', '$lineCount'] }, then: 'dispensed' },
              { case: { $gt: ['$started', 0] }, then: 'partial' },
            ],
            default: 'pending',
          },
        },
      },
    },
  ]);

/**
 * Prescriptions a pharmacist still has work on — nothing dispensed yet, or
 * only some lines done. This is the dispensing queue.
 */
export const outstandingPrescriptionIds = async (): Promise<Types.ObjectId[]> => {
  const states = await prescriptionFulfillmentStates();
  return states.filter((entry) => entry.state !== 'dispensed').map((entry) => entry._id);
};

export const stockLookupStages = (): PipelineStage[] => [
  {
    $lookup: {
      from: 'inventorybatches',
      let: { mid: '$_id' },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ['$medicineId', '$$mid'] },
                { $gt: ['$expiryDate', new Date()] },
              ],
            },
          },
        },
        { $group: { _id: null, total: { $sum: '$quantity' } } },
      ],
      as: 'stockInfo',
    },
  },
  {
    $addFields: {
      totalStock: { $ifNull: [{ $arrayElemAt: ['$stockInfo.total', 0] }, 0] },
      lowStock: {
        $lt: [
          { $ifNull: [{ $arrayElemAt: ['$stockInfo.total', 0] }, 0] },
          '$reorderLevel',
        ],
      },
    },
  },
  { $project: { stockInfo: 0 } },
];

export interface PharmacyStats {
  totalMedicines: number;
  activeMedicines: number;
  lowStockCount: number;
  expiredBatches: number;
  outstandingPrescriptions: number;
  todaysDispensings: number;
}

export const getPharmacyStats = async (): Promise<PharmacyStats> => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [totalMedicines, activeMedicines, lowStockAgg, expiredBatches, outstandingIds, todaysDispensings] =
    await Promise.all([
      Medicine.countDocuments({}),
      Medicine.countDocuments({ status: 'active' }),
      Medicine.aggregate([
        { $match: { status: 'active' } },
        ...stockLookupStages(),
        { $match: { lowStock: true } },
        { $count: 'count' },
      ]),
      InventoryBatch.countDocuments({ expiryDate: { $lte: new Date() }, quantity: { $gt: 0 } }),
      outstandingPrescriptionIds(),
      DispensingRecord.countDocuments({ createdAt: { $gte: startOfDay } }),
    ]);

  return {
    totalMedicines,
    activeMedicines,
    lowStockCount: (lowStockAgg[0] as { count?: number } | undefined)?.count ?? 0,
    expiredBatches,
    /**
     * Everything still needing work, which is what the dispensing queue lists.
     * This used to count only prescriptions never touched, so a half-dispensed
     * one vanished from the tile while still sitting in the queue below it —
     * the same board reporting two different amounts of work.
     */
    outstandingPrescriptions: outstandingIds.length,
    todaysDispensings,
  };
};
