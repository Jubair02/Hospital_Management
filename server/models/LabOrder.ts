import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';

export const LAB_PRIORITIES = ['routine', 'urgent'] as const;
export type LabPriority = (typeof LAB_PRIORITIES)[number];

export const LAB_ORDER_STATUSES = [
  'ordered',
  'sample_collected',
  'processing',
  'completed',
  'cancelled',
] as const;
export type LabOrderStatus = (typeof LAB_ORDER_STATUSES)[number];

/**
 * Order status is driven by WORKFLOW ACTIONS (sample collection, result
 * entry, verification), never by direct status writes — the only direct
 * transition the API accepts is cancellation of a non-final order.
 */
export const CANCELLABLE_STATUSES: LabOrderStatus[] = [
  'ordered',
  'sample_collected',
  'processing',
];

export interface ILabOrderTest {
  testId: Types.ObjectId;
  /** Snapshots taken at order time so catalog edits don't rewrite history. */
  testName: string;
  price: number;
}

export interface ILabOrder {
  orderId: string;
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId;
  appointmentId?: Types.ObjectId;
  consultationId: Types.ObjectId;
  tests: ILabOrderTest[];
  clinicalNotes?: string;
  priority: LabPriority;
  status: LabOrderStatus;
  orderedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type LabOrderDocument = HydratedDocument<ILabOrder>;

const orderTestSchema = new Schema<ILabOrderTest>(
  {
    testId: { type: Schema.Types.ObjectId, ref: 'LabTest', required: true },
    testName: { type: String, required: true, trim: true, maxlength: 200 },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const labOrderSchema = new Schema<ILabOrder>(
  {
    orderId: { type: String, required: true, unique: true, immutable: true },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      immutable: true,
      index: true,
    },
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
      immutable: true,
      index: true,
    },
    appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', immutable: true },
    consultationId: {
      type: Schema.Types.ObjectId,
      ref: 'Consultation',
      required: true,
      immutable: true,
      index: true,
    },
    tests: {
      type: [orderTestSchema],
      required: true,
      validate: {
        validator: (v: ILabOrderTest[]) => v.length > 0 && v.length <= 20,
        message: 'An order must contain between 1 and 20 tests',
      },
    },
    clinicalNotes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Clinical notes cannot exceed 1000 characters'],
    },
    priority: {
      type: String,
      default: 'routine',
      enum: {
        values: LAB_PRIORITIES as unknown as string[],
        message: `Priority must be one of: ${LAB_PRIORITIES.join(', ')}`,
      },
      index: true,
    },
    status: {
      type: String,
      default: 'ordered',
      enum: {
        values: LAB_ORDER_STATUSES as unknown as string[],
        message: `Status must be one of: ${LAB_ORDER_STATUSES.join(', ')}`,
      },
      index: true,
    },
    orderedAt: { type: Date, required: true, default: Date.now, index: true },
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

const LabOrder: Model<ILabOrder> = mongoose.model<ILabOrder>('LabOrder', labOrderSchema);

export default LabOrder;
