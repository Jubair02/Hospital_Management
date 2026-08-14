import api from './api';
import type {
  ApiResponse,
  Appointment,
  AppointmentStats,
  AppointmentsListData,
  AppointmentsQuery,
  CreateAppointmentPayload,
  UpdateAppointmentPayload,
} from '../types';

export const getAppointments = async (
  params: AppointmentsQuery = {}
): Promise<AppointmentsListData> => {
  const { data } = await api.get<ApiResponse<AppointmentsListData>>('/appointments', { params });
  return data.data;
};

export const getAppointmentById = async (id: string): Promise<Appointment> => {
  const { data } = await api.get<ApiResponse<{ appointment: Appointment }>>(
    `/appointments/${id}`
  );
  return data.data.appointment;
};

export const createAppointment = async (
  payload: CreateAppointmentPayload
): Promise<Appointment> => {
  const { data } = await api.post<ApiResponse<{ appointment: Appointment }>>(
    '/appointments',
    payload
  );
  return data.data.appointment;
};

export const updateAppointment = async (
  id: string,
  payload: UpdateAppointmentPayload
): Promise<Appointment> => {
  const { data } = await api.patch<ApiResponse<{ appointment: Appointment }>>(
    `/appointments/${id}`,
    payload
  );
  return data.data.appointment;
};

export const updateAppointmentStatus = async (
  id: string,
  status: string
): Promise<Appointment> => {
  const { data } = await api.patch<ApiResponse<{ appointment: Appointment }>>(
    `/appointments/${id}/status`,
    { status }
  );
  return data.data.appointment;
};

export const getAppointmentStats = async (): Promise<AppointmentStats> => {
  const { data } = await api.get<ApiResponse<AppointmentStats>>('/appointments/stats');
  return data.data;
};
