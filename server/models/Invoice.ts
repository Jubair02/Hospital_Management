import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';

export const INVOICE_STATUSES = ['draft', 'issued', 'cancelled'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_STATUSES = ['unpaid', 'partially_paid', 'paid', 'refunded'] as const;
export type InvoicePaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const ITEM_TYPES = ['consultation', 'lab_order', 'pharmacy', 'service'] as const;
export type InvoiceItemType = (typeof ITEM_TYPES)[number];

export interface IInvoiceItem {
  itemType: InvoiceItemType;
  /** Points at the source record (consultation / lab order / dispensing). */
  referenceId?: Types.ObjectId;
  description: string;
  quantity: number;
  unitPrice: number;
  /** Computed on the backend — never taken from the client. */
  totalPrice: number;
}

export interface IInvoice {
  invoiceId: string;
  patientId: Types.ObjectId;
  appointmentId?: Types.ObjectId;
  items: IInvoiceItem[];
  subtotal: number;
  discount: number;
  tax: number;
  totalAmount: number;
  amountPaid: number;
  dueAmount: number;
  paymentStatus: InvoicePaymentStatus;
  invoiceStatus: InvoiceStatus;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type InvoiceDocument = HydratedDocument<IInvoice>;

const money = (label: string) => ({
  type: Number,
  required: true,
  min: [0, `${label} cannot be negative`] as [number, string],
});

const invoiceItemSchema = new Schema<IInvoiceItem>(
  {
    itemType: {
      type: String,
      required: true,
      enum: {
        values: ITEM_TYPES as unknown as string[],
        message: `Item type must be one of: ${ITEM_TYPES.join(', ')}`,
      },
    },
    referenceId: { type: Schema.Types.ObjectId },
    description: {
      type: String,
      required: [true, 'Item description is required'],
      trim: true,
      maxlength: [300, 'Item description cannot exceed 300 characters'],
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1'],
      validate: { validator: Number.isInteger, message: 'Quantity must be a whole number' },
    },
    unitPrice: money('Unit price'),
    totalPrice: money('Total price'),
  },
  { _id: false }
);

const invoiceSchema = new Schema<IInvoice>(
  {
    invoiceId: { type: String, required: true, unique: true, immutable: true },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      immutable: true,
      index: true,
    },
    appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment' },
    items: {
      type: [invoiceItemSchema],
      required: true,
      validate: {
        validator: (v: IInvoiceItem[]) => v.length > 0 && v.length <= 50,
        message: 'An invoice must contain between 1 and 50 items',
      },
    },
    subtotal: money('Subtotal'),
    discount: money('Discount'),
    tax: money('Tax'),
    totalAmount: money('Total amount'),
    amountPaid: money('Amount paid'),
    dueAmount: money('Due amount'),
    paymentStatus: {
      type: String,
      default: 'unpaid',
      enum: {
        values: PAYMENT_STATUSES as unknown as string[],
        message: `Payment status must be one of: ${PAYMENT_STATUSES.join(', ')}`,
      },
      index: true,
    },
    invoiceStatus: {
      type: String,
      default: 'draft',
      enum: {
        values: INVOICE_STATUSES as unknown as string[],
        message: `Invoice status must be one of: ${INVOICE_STATUSES.join(', ')}`,
      },
      index: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
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

// Billing reports and the invoice list read newest-first by creation date.
invoiceSchema.index({ createdAt: -1 });

const Invoice: Model<IInvoice> = mongoose.model<IInvoice>('Invoice', invoiceSchema);

export default Invoice;
