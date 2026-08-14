import api from './api';
import type {
  ApiResponse,
  CreatePatientPayload,
  Patient,
  PatientStats,
  PatientsListData,
  PatientsQuery,
  UpdatePatientPayload,
} from '../types';

export const getPatients = async (params: PatientsQuery = {}): Promise<PatientsListData> => {
  const { data } = await api.get<ApiResponse<PatientsListData>>('/patients', { params });
  return data.data; // { patients, pagination }
};

export const getPatientById = async (id: string): Promise<Patient> => {
  const { data } = await api.get<ApiResponse<{ patient: Patient }>>(`/patients/${id}`);
  return data.data.patient;
};

export const createPatient = async (payload: CreatePatientPayload): Promise<Patient> => {
  const { data } = await api.post<ApiResponse<{ patient: Patient }>>('/patients', payload);
  return data.data.patient;
};

export const updatePatient = async (
  id: string,
  payload: UpdatePatientPayload
): Promise<Patient> => {
  const { data } = await api.patch<ApiResponse<{ patient: Patient }>>(`/patients/${id}`, payload);
  return data.data.patient;
};

export const updatePatientStatus = async (
  id: string,
  status: 'active' | 'inactive'
): Promise<Patient> => {
  const { data } = await api.patch<ApiResponse<{ patient: Patient }>>(
    `/patients/${id}/status`,
    { status }
  );
  return data.data.patient;
};

export const getPatientStats = async (): Promise<PatientStats> => {
  const { data } = await api.get<ApiResponse<PatientStats>>('/patients/stats');
  return data.data;
};

/**
 * Issues a patient-portal login linked to this patient record
 * (admin/receptionist only; one account per patient).
 */
export const createPortalAccount = async (
  patientMongoId: string,
  payload: { email: string; password: string }
): Promise<Patient> => {
  const { data } = await api.post<ApiResponse<{ patient: Patient }>>(
    `/patients/${patientMongoId}/portal-account`,
    payload
  );
  return data.data.patient;
};
