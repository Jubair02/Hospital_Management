import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';

export interface IInventoryBatch {
  batchId: string;
  medicineId: Types.ObjectId;
  batchNumber: string;
  /** Current on-hand quantity — atomic guarded updates keep this >= 0. */
  quantity: number;
  initialQuantity: number;
  unitCost: number;
  sellingPrice: number;
  manufactureDate?: Date;
  expiryDate: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IInventoryBatchVirtuals {
  isExpired: boolean;
  isDepleted: boolean;
}

export type InventoryBatchDocument = HydratedDocument<IInventoryBatch, IInventoryBatchVirtuals>;

// eslint-disable-next-line @typescript-eslint/ban-types
type EmptyOverrides = {};

type InventoryBatchModel = Model<
  IInventoryBatch,
  EmptyOverrides,
  EmptyOverrides,
  IInventoryBatchVirtuals
>;

const batchSchema = new Schema<
  IInventoryBatch,
  InventoryBatchModel,
  EmptyOverrides,
  EmptyOverrides,
  IInventoryBatchVirtuals
>(
  {
    batchId: { type: String, required: true, unique: true, immutable: true },
    medicineId: {
      type: Schema.Types.ObjectId,
      ref: 'Medicine',
      required: [true, 'Medicine is required'],
    },
    batchNumber: {
      type: String,
      required: [true, 'Batch number is required'],
      trim: true,
      maxlength: [100, 'Batch number cannot exceed 100 characters'],
    },
    quantity: {
      type: Number,
      required: true,
      min: [0, 'Quantity cannot be negative'],
    },
    initialQuantity: {
      type: Number,
      required: true,
      min: [1, 'Initial quantity must be at least 1'],
    },
    unitCost: {
      type: Number,
      required: [true, 'Unit cost is required'],
      min: [0, 'Unit cost cannot be negative'],
    },
    sellingPrice: {
      type: Number,
      required: [true, 'Selling price is required'],
      min: [0, 'Selling price cannot be negative'],
    },
    manufactureDate: { type: Date },
    expiryDate: {
      type: Date,
      required: [true, 'Expiry date is required'],
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, 'Notes cannot exceed 500 characters'],
    },
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

// FEFO selection always scopes by medicine and sorts by expiry.
batchSchema.index({ medicineId: 1, expiryDate: 1 });
// One batch document per medicine + batch number.
batchSchema.index({ medicineId: 1, batchNumber: 1 }, { unique: true });

// Defensive: populated projections may omit fields — never crash serialization.
batchSchema.virtual('isExpired').get(function (this: InventoryBatchDocument) {
  return this.expiryDate ? this.expiryDate.getTime() <= Date.now() : false;
});

batchSchema.virtual('isDepleted').get(function (this: InventoryBatchDocument) {
  return this.quantity === 0;
});

const InventoryBatch = mongoose.model<IInventoryBatch, InventoryBatchModel>(
  'InventoryBatch',
  batchSchema
);

export default InventoryBatch;
