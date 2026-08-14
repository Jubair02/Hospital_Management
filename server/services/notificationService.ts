import type { Types } from 'mongoose';
import Notification, {
  type NotificationDocument,
  type NotificationReferenceType,
  type NotificationType,
} from '../models/Notification.js';
import User, { type Role } from '../models/User.js';
import Doctor from '../models/Doctor.js';
import Patient from '../models/Patient.js';
import logger from '../utils/logger.js';
import { nextSequenceId } from './sequenceService.js';

export const nextNotificationId = (): Promise<string> =>
  nextSequenceId('notificationId', 'NTF', 6);

export interface NotifyInput {
  recipientId: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  referenceType?: NotificationReferenceType;
  referenceId?: Types.ObjectId;
  /** Event identity — repeats for the same recipient are ignored. */
  dedupeKey?: string;
}

/**
 * Creates one notification, ignoring duplicates for the same event.
 * Returns null when the notification already existed.
 */
export const createNotification = async (
  input: NotifyInput
): Promise<NotificationDocument | null> => {
  try {
    return await Notification.create({
      notificationId: await nextNotificationId(),
      recipientId: input.recipientId,
      type: input.type,
      title: input.title,
      message: input.message,
      referenceType: input.referenceType ?? 'none',
      referenceId: input.referenceId,
      dedupeKey: input.dedupeKey,
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return null; // already sent
    throw err;
  }
};

/** Active users holding any of the given roles. */
const usersWithRoles = async (roles: Role[]): Promise<Types.ObjectId[]> => {
  const users = await User.find({ role: { $in: roles }, isActive: true }).select('_id').lean();
  return users.map((u) => u._id);
};

/** The User behind a Doctor profile, if any. */
const userForDoctor = async (doctorId: Types.ObjectId): Promise<Types.ObjectId | null> => {
  const doctor = await Doctor.findById(doctorId).select('userId').lean();
  return doctor?.userId ?? null;
};

/**
 * Fans a notification out to every active user in the given roles.
 * Never throws — notifications are secondary to the operation that
 * triggered them, so failures are logged and swallowed.
 */
export const notifyRoles = async (
  roles: Role[],
  input: Omit<NotifyInput, 'recipientId'>
): Promise<void> => {
  try {
    const recipients = await usersWithRoles(roles);
    await Promise.all(
      recipients.map((recipientId) => createNotification({ ...input, recipientId }))
    );
  } catch (err) {
    logger.warn(`Notification fan-out failed: ${err instanceof Error ? err.message : 'unknown'}`);
  }
};

/** Notifies a single user. Never throws (see notifyRoles). */
export const notifyUser = async (
  recipientId: Types.ObjectId,
  input: Omit<NotifyInput, 'recipientId'>
): Promise<void> => {
  try {
    await createNotification({ ...input, recipientId });
  } catch (err) {
    logger.warn(`Notification failed: ${err instanceof Error ? err.message : 'unknown'}`);
  }
};

/** Notifies the user behind a doctor profile. Never throws. */
export const notifyDoctor = async (
  doctorId: Types.ObjectId,
  input: Omit<NotifyInput, 'recipientId'>
): Promise<void> => {
  try {
    const recipientId = await userForDoctor(doctorId);
    if (recipientId) await createNotification({ ...input, recipientId });
  } catch (err) {
    logger.warn(`Doctor notification failed: ${err instanceof Error ? err.message : 'unknown'}`);
  }
};

/**
 * Notifies the portal user behind a patient record, if one is linked.
 * Never throws — patients without portal accounts simply receive
 * nothing, and a notification failure never fails the business action.
 */
export const notifyPatient = async (
  patientId: Types.ObjectId,
  input: Omit<NotifyInput, 'recipientId'>
): Promise<void> => {
  try {
    const patient = await Patient.findById(patientId).select('userId');
    if (patient?.userId) await createNotification({ ...input, recipientId: patient.userId });
  } catch (err) {
    logger.warn(`Patient notification failed: ${err instanceof Error ? err.message : 'unknown'}`);
  }
};

// ---------------------------------------------------------------------------
// Inbox operations — always scoped to the requesting user.
// ---------------------------------------------------------------------------

export const markAsRead = async (
  notificationMongoId: string,
  recipientId: Types.ObjectId
): Promise<NotificationDocument | null> =>
  Notification.findOneAndUpdate(
    { _id: notificationMongoId, recipientId },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true }
  );

export const markAllAsRead = async (recipientId: Types.ObjectId): Promise<number> => {
  const result = await Notification.updateMany(
    { recipientId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
  return result.modifiedCount;
};

export const unreadCount = (recipientId: Types.ObjectId): Promise<number> =>
  Notification.countDocuments({ recipientId, isRead: false });
