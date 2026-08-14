import api from './api';
import type {
  ApiResponse,
  Consultation,
  ConsultationStats,
  ConsultationsListData,
  ConsultationsQuery,
  UpdateConsultationPayload,
} from '../types';

export const getConsultations = async (
  params: ConsultationsQuery = {}
): Promise<ConsultationsListData> => {
  const { data } = await api.get<ApiResponse<ConsultationsListData>>('/consultations', {
    params,
  });
  return data.data;
};

export const getConsultationById = async (id: string): Promise<Consultation> => {
  const { data } = await api.get<ApiResponse<{ consultation: Consultation }>>(
    `/consultations/${id}`
  );
  return data.data.consultation;
};

export const createConsultation = async (appointmentId: string): Promise<Consultation> => {
  const { data } = await api.post<ApiResponse<{ consultation: Consultation }>>(
    '/consultations',
    { appointmentId }
  );
  return data.data.consultation;
};

export const updateConsultation = async (
  id: string,
  payload: UpdateConsultationPayload
): Promise<Consultation> => {
  const { data } = await api.patch<ApiResponse<{ consultation: Consultation }>>(
    `/consultations/${id}`,
    payload
  );
  return data.data.consultation;
};

export const updateConsultationStatus = async (
  id: string,
  status: 'completed' | 'cancelled'
): Promise<Consultation> => {
  const { data } = await api.patch<ApiResponse<{ consultation: Consultation }>>(
    `/consultations/${id}/status`,
    { status }
  );
  return data.data.consultation;
};

export const getPatientConsultations = async (
  patientId: string,
  params: ConsultationsQuery = {}
): Promise<ConsultationsListData> => {
  const { data } = await api.get<ApiResponse<ConsultationsListData>>(
    `/patients/${patientId}/consultations`,
    { params }
  );
  return data.data;
};

export const getDoctorConsultations = async (
  doctorId: string,
  params: ConsultationsQuery = {}
): Promise<ConsultationsListData> => {
  const { data } = await api.get<ApiResponse<ConsultationsListData>>(
    `/doctors/${doctorId}/consultations`,
    { params }
  );
  return data.data;
};

export const getConsultationStats = async (): Promise<ConsultationStats> => {
  const { data } = await api.get<ApiResponse<ConsultationStats>>('/consultations/stats');
  return data.data;
};
