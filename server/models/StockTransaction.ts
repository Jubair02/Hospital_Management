import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';

export const TRANSACTION_TYPES = [
  'stock_in',
  'dispense',
  'adjustment',
  'expiry',
  'return',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/**
 * Immutable ledger of every inventory movement. Rows are only ever
 * created — never updated or deleted.
 */
export interface IStockTransaction {
  transactionId: string;
  type: TransactionType;
  medicineId: Types.ObjectId;
  batchId: Types.ObjectId;
  /** Signed change: positive adds stock, negative removes it. */
  quantityChange: number;
  /** Batch quantity immediately after this movement. */
  balanceAfter: number;
  /** Related record (e.g. a dispensing ID). */
  reference?: string;
  notes?: string;
  performedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type StockTransactionDocument = HydratedDocument<IStockTransaction>;

const transactionSchema = new Schema<IStockTransaction>(
  {
    transactionId: { type: String, required: true, unique: true, immutable: true },
    type: {
      type: String,
      required: true,
      enum: {
        values: TRANSACTION_TYPES as unknown as string[],
        message: `Type must be one of: ${TRANSACTION_TYPES.join(', ')}`,
      },
      index: true,
    },
    medicineId: {
      type: Schema.Types.ObjectId,
      ref: 'Medicine',
      required: true,
      index: true,
    },
    batchId: {
      type: Schema.Types.ObjectId,
      ref: 'InventoryBatch',
      required: true,
      index: true,
    },
    quantityChange: {
      type: Number,
      required: true,
      validate: {
        validator: (v: number) => Number.isInteger(v) && v !== 0,
        message: 'Quantity change must be a non-zero integer',
      },
    },
    balanceAfter: {
      type: Number,
      required: true,
      min: [0, 'Balance cannot be negative'],
    },
    reference: {
      type: String,
      trim: true,
      maxlength: [100, 'Reference cannot exceed 100 characters'],
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, 'Notes cannot exceed 500 characters'],
    },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User' },
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

const StockTransaction: Model<IStockTransaction> = mongoose.model<IStockTransaction>(
  'StockTransaction',
  transactionSchema
);

export default StockTransaction;
