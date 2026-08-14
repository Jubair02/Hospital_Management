import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';

export const NOTIFICATION_TYPES = [
  'appointment',
  'lab_result',
  'prescription',
  'payment',
  'admission',
  'discharge',
  'low_stock',
  'system',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const REFERENCE_TYPES = [
  'appointment',
  'consultation',
  'lab_order',
  'lab_result',
  'invoice',
  'payment',
  'admission',
  'medicine',
  'none',
] as const;
export type NotificationReferenceType = (typeof REFERENCE_TYPES)[number];

export interface INotification {
  notificationId: string;
  recipientId: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  referenceType: NotificationReferenceType;
  referenceId?: Types.ObjectId;
  /**
   * Stable identity of the underlying event for this recipient. A sparse
   * unique index on { recipientId, dedupeKey } makes duplicate
   * notifications for the same event impossible.
   */
  dedupeKey?: string;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationDocument = HydratedDocument<INotification>;

const notificationSchema = new Schema<INotification>(
  {
    notificationId: { type: String, required: true, unique: true, immutable: true },
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    type: {
      type: String,
      required: true,
      enum: {
        values: NOTIFICATION_TYPES as unknown as string[],
        message: `Type must be one of: ${NOTIFICATION_TYPES.join(', ')}`,
      },
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: [500, 'Message cannot exceed 500 characters'],
    },
    referenceType: {
      type: String,
      default: 'none',
      enum: {
        values: REFERENCE_TYPES as unknown as string[],
        message: `Reference type must be one of: ${REFERENCE_TYPES.join(', ')}`,
      },
    },
    referenceId: { type: Schema.Types.ObjectId },
    dedupeKey: { type: String, trim: true, maxlength: 200 },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
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

// Inbox queries: newest first per recipient, and unread counts.
notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, isRead: 1 });

// One notification per recipient per event.
notificationSchema.index(
  { recipientId: 1, dedupeKey: 1 },
  { unique: true, sparse: true, name: 'one_notification_per_event' }
);

const Notification: Model<INotification> = mongoose.model<INotification>(
  'Notification',
  notificationSchema
);

export default Notification;
