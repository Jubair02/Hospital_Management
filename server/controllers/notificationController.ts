import type { FilterQuery } from 'mongoose';
import Notification, { type INotification } from '../models/Notification.js';
import { markAllAsRead, markAsRead, unreadCount } from '../services/notificationService.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

const queryString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

/**
 * GET /api/notifications
 * Always scoped to the calling user — there is no way to request
 * someone else's inbox.
 */
export const getNotifications = asyncHandler(async (req, res) => {
  const query = req.query as Record<string, unknown>;
  const page = Math.max(parseInt(queryString(query.page) ?? '', 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(queryString(query.limit) ?? '', 10) || 20, 1), 100);

  const filter: FilterQuery<INotification> = { recipientId: req.user!._id };

  const type = queryString(query.type);
  if (type) filter.type = type as INotification['type'];
  const unreadOnly = queryString(query.unread);
  if (unreadOnly === 'true') filter.isRead = false;

  const [notifications, total, unread] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Notification.countDocuments(filter),
    unreadCount(req.user!._id),
  ]);

  res.json({
    success: true,
    message: 'Notifications fetched',
    data: {
      notifications,
      unreadCount: unread,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    },
  });
});

/** GET /api/notifications/unread-count — for the header indicator. */
export const getUnreadCount = asyncHandler(async (req, res) => {
  const unread = await unreadCount(req.user!._id);
  res.json({ success: true, message: 'Unread count fetched', data: { unreadCount: unread } });
});

/**
 * PATCH /api/notifications/:id/read
 * The recipient filter is part of the update query, so marking another
 * user's notification simply finds nothing (404).
 */
export const patchMarkRead = asyncHandler(async (req, res) => {
  const notification = await markAsRead(req.params.id as string, req.user!._id);
  if (!notification) throw new ApiError(404, 'Notification not found');

  res.json({ success: true, message: 'Notification marked as read', data: { notification } });
});

/** PATCH /api/notifications/read-all */
export const patchMarkAllRead = asyncHandler(async (req, res) => {
  const updated = await markAllAsRead(req.user!._id);
  res.json({
    success: true,
    message: `${updated} notification(s) marked as read`,
    data: { updated },
  });
});
