import api from './api';
import type {
  ApiResponse,
  AvailabilitySlot,
  CreateDoctorPayload,
  Doctor,
  DoctorsListData,
  DoctorsQuery,
  UpdateDoctorPayload,
} from '../types';

export const getDoctors = async (params: DoctorsQuery = {}): Promise<DoctorsListData> => {
  const { data } = await api.get<ApiResponse<DoctorsListData>>('/doctors', { params });
  return data.data;
};

export const getDoctorById = async (id: string): Promise<Doctor> => {
  const { data } = await api.get<ApiResponse<{ doctor: Doctor }>>(`/doctors/${id}`);
  return data.data.doctor;
};

export const getMyDoctorProfile = async (): Promise<Doctor> => {
  const { data } = await api.get<ApiResponse<{ doctor: Doctor }>>('/doctors/me');
  return data.data.doctor;
};

export const getSpecializations = async (): Promise<string[]> => {
  const { data } = await api.get<ApiResponse<{ specializations: string[] }>>(
    '/doctors/specializations'
  );
  return data.data.specializations;
};

export const createDoctor = async (payload: CreateDoctorPayload): Promise<Doctor> => {
  const { data } = await api.post<ApiResponse<{ doctor: Doctor }>>('/doctors', payload);
  return data.data.doctor;
};

export const updateDoctor = async (id: string, payload: UpdateDoctorPayload): Promise<Doctor> => {
  const { data } = await api.patch<ApiResponse<{ doctor: Doctor }>>(`/doctors/${id}`, payload);
  return data.data.doctor;
};

export const updateDoctorStatus = async (
  id: string,
  status: 'active' | 'inactive'
): Promise<Doctor> => {
  const { data } = await api.patch<ApiResponse<{ doctor: Doctor }>>(`/doctors/${id}/status`, {
    status,
  });
  return data.data.doctor;
};

export const getDoctorAvailability = async (id: string): Promise<AvailabilitySlot[]> => {
  const { data } = await api.get<ApiResponse<{ availability: AvailabilitySlot[] }>>(
    `/doctors/${id}/availability`
  );
  return data.data.availability;
};

export const updateDoctorAvailability = async (
  id: string,
  availability: AvailabilitySlot[]
): Promise<AvailabilitySlot[]> => {
  const { data } = await api.put<ApiResponse<{ availability: AvailabilitySlot[] }>>(
    `/doctors/${id}/availability`,
    { availability }
  );
  return data.data.availability;
};
