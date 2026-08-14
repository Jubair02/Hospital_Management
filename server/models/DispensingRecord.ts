import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';

export interface IDispensedBatch {
  batchId: Types.ObjectId;
  batchNumber: string;
  quantity: number;
  sellingPrice: number;
}

export interface IDispensedItem {
  prescriptionIndex: number;
  medicineId: Types.ObjectId;
  medicineName: string;
  quantity: number;
  batches: IDispensedBatch[];
}

/** One dispensing event (full or partial) against a consultation. */
export interface IDispensingRecord {
  dispensingId: string;
  consultationId: Types.ObjectId;
  patientId: Types.ObjectId;
  items: IDispensedItem[];
  dispensedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type DispensingRecordDocument = HydratedDocument<IDispensingRecord>;

const dispensedBatchSchema = new Schema<IDispensedBatch>(
  {
    batchId: { type: Schema.Types.ObjectId, ref: 'InventoryBatch', required: true },
    batchNumber: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    sellingPrice: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const dispensedItemSchema = new Schema<IDispensedItem>(
  {
    prescriptionIndex: { type: Number, required: true, min: 0 },
    medicineId: { type: Schema.Types.ObjectId, ref: 'Medicine', required: true },
    medicineName: { type: String, required: true, trim: true, maxlength: 200 },
    quantity: { type: Number, required: true, min: 1 },
    batches: { type: [dispensedBatchSchema], required: true },
  },
  { _id: false }
);

const dispensingSchema = new Schema<IDispensingRecord>(
  {
    dispensingId: { type: String, required: true, unique: true, immutable: true },
    consultationId: {
      type: Schema.Types.ObjectId,
      ref: 'Consultation',
      required: true,
      index: true,
    },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    items: { type: [dispensedItemSchema], required: true },
    dispensedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Pharmacy reports and history read newest-first by dispensing date.
dispensingSchema.index({ createdAt: -1 });

const DispensingRecord: Model<IDispensingRecord> = mongoose.model<IDispensingRecord>(
  'DispensingRecord',
  dispensingSchema
);

export default DispensingRecord;
