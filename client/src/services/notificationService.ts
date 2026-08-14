import api from './api';
import type {
  ApiResponse,
  AppNotification,
  NotificationFilters,
  NotificationsListData,
} from '../types';

export const getNotifications = async (
  filters: NotificationFilters = {}
): Promise<NotificationsListData> => {
  const { data } = await api.get<ApiResponse<NotificationsListData>>('/notifications', {
    params: filters,
  });
  return data.data;
};

export const getUnreadCount = async (): Promise<number> => {
  const { data } = await api.get<ApiResponse<{ unreadCount: number }>>(
    '/notifications/unread-count'
  );
  return data.data.unreadCount;
};

export const markNotificationRead = async (id: string): Promise<AppNotification> => {
  const { data } = await api.patch<ApiResponse<{ notification: AppNotification }>>(
    `/notifications/${id}/read`,
    {}
  );
  return data.data.notification;
};

export const markAllNotificationsRead = async (): Promise<number> => {
  const { data } = await api.patch<ApiResponse<{ updated: number }>>(
    '/notifications/read-all',
    {}
  );
  return data.data.updated;
};
