import api from './api';
import type {
  ApiResponse,
  AuditLogFilters,
  AuditLogsListData,
  AuditVocabulary,
  SystemHealth,
  SystemSettings,
  SystemSettingsPayload,
} from '../types';

export const getAuditLogs = async (
  filters: AuditLogFilters = {}
): Promise<AuditLogsListData> => {
  const { data } = await api.get<ApiResponse<AuditLogsListData>>('/admin/audit-logs', {
    params: filters,
  });
  return data.data;
};

export const getAuditVocabulary = async (): Promise<AuditVocabulary> => {
  const { data } = await api.get<ApiResponse<AuditVocabulary>>('/admin/audit-logs/vocabulary');
  return data.data;
};

export const getSystemSettings = async (): Promise<SystemSettings> => {
  const { data } = await api.get<ApiResponse<{ settings: SystemSettings }>>('/admin/settings');
  return data.data.settings;
};

export const updateSystemSettings = async (
  payload: SystemSettingsPayload
): Promise<SystemSettings> => {
  const { data } = await api.patch<ApiResponse<{ settings: SystemSettings }>>(
    '/admin/settings',
    payload
  );
  return data.data.settings;
};

export const getSystemHealth = async (): Promise<SystemHealth> => {
  const { data } = await api.get<ApiResponse<SystemHealth>>('/admin/system-health');
  return data.data;
};
