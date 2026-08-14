import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';

/** Immutable history of inpatient bed/ward moves. */
export interface IBedTransfer {
  transferId: string;
  admissionId: Types.ObjectId;
  patientId: Types.ObjectId;
  fromWardId: Types.ObjectId;
  fromBedId: Types.ObjectId;
  toWardId: Types.ObjectId;
  toBedId: Types.ObjectId;
  reason?: string;
  transferredBy?: Types.ObjectId;
  transferredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type BedTransferDocument = HydratedDocument<IBedTransfer>;

const bedTransferSchema = new Schema<IBedTransfer>(
  {
    transferId: { type: String, required: true, unique: true, immutable: true },
    admissionId: {
      type: Schema.Types.ObjectId,
      ref: 'Admission',
      required: true,
      immutable: true,
      index: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      immutable: true,
      index: true,
    },
    fromWardId: { type: Schema.Types.ObjectId, ref: 'Ward', required: true },
    fromBedId: { type: Schema.Types.ObjectId, ref: 'Bed', required: true },
    toWardId: { type: Schema.Types.ObjectId, ref: 'Ward', required: true },
    toBedId: { type: Schema.Types.ObjectId, ref: 'Bed', required: true },
    reason: {
      type: String,
      trim: true,
      maxlength: [500, 'Reason cannot exceed 500 characters'],
    },
    transferredBy: { type: Schema.Types.ObjectId, ref: 'User' },
    transferredAt: { type: Date, required: true, default: Date.now },
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

const BedTransfer: Model<IBedTransfer> = mongoose.model<IBedTransfer>(
  'BedTransfer',
  bedTransferSchema
);

export default BedTransfer;
