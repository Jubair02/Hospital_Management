import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';

export const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'mobile_banking'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_RECORD_STATUSES = ['completed', 'failed', 'refunded'] as const;
export type PaymentRecordStatus = (typeof PAYMENT_RECORD_STATUSES)[number];

export const PAYMENT_TYPES = ['payment', 'refund'] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

/**
 * Immutable ledger of money movements. Refunds are their own rows
 * (type: 'refund', linked to the original via refundOf) — payments are
 * never deleted or silently modified. Only a method label and optional
 * free-text reference are stored — never card numbers, CVVs, or bank
 * credentials.
 */
export interface IPayment {
  paymentId: string;
  invoiceId: Types.ObjectId;
  patientId: Types.ObjectId;
  type: PaymentType;
  amount: number;
  method: PaymentMethod;
  transactionReference?: string;
  status: PaymentRecordStatus;
  refundOf?: Types.ObjectId;
  receivedBy?: Types.ObjectId;
  paidAt: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type PaymentDocument = HydratedDocument<IPayment>;

const paymentSchema = new Schema<IPayment>(
  {
    paymentId: { type: String, required: true, unique: true, immutable: true },
    invoiceId: {
      type: Schema.Types.ObjectId,
      ref: 'Invoice',
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
    type: {
      type: String,
      default: 'payment',
      immutable: true,
      enum: {
        values: PAYMENT_TYPES as unknown as string[],
        message: `Type must be one of: ${PAYMENT_TYPES.join(', ')}`,
      },
    },
    amount: {
      type: Number,
      required: true,
      min: [0.01, 'Amount must be positive'],
    },
    method: {
      type: String,
      required: true,
      enum: {
        values: PAYMENT_METHODS as unknown as string[],
        message: `Method must be one of: ${PAYMENT_METHODS.join(', ')}`,
      },
      index: true,
    },
    transactionReference: {
      type: String,
      trim: true,
      maxlength: [200, 'Transaction reference cannot exceed 200 characters'],
    },
    status: {
      type: String,
      default: 'completed',
      enum: {
        values: PAYMENT_RECORD_STATUSES as unknown as string[],
        message: `Status must be one of: ${PAYMENT_RECORD_STATUSES.join(', ')}`,
      },
      index: true,
    },
    refundOf: { type: Schema.Types.ObjectId, ref: 'Payment' },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    paidAt: { type: Date, required: true, default: Date.now, index: true },
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

const Payment: Model<IPayment> = mongoose.model<IPayment>('Payment', paymentSchema);

export default Payment;
