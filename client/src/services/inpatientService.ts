import api from './api';
import type {
  Admission,
  AdmissionsListData,
  AdmissionsQuery,
  AdmitPatientPayload,
  ApiResponse,
  BedsListData,
  BedTransfer,
  HospitalBed,
  InpatientStats,
  Pagination,
  Ward,
  WardsListData,
} from '../types';

// --- Wards ---

export const getWards = async (
  params: { page?: number; limit?: number; search?: string; type?: string; status?: string } = {}
): Promise<WardsListData> => {
  const { data } = await api.get<ApiResponse<WardsListData>>('/inpatient/wards', { params });
  return data.data;
};

export const createWard = async (payload: {
  name: string;
  type: string;
  department?: string;
  floor?: string;
  description?: string;
}): Promise<Ward> => {
  const { data } = await api.post<ApiResponse<{ ward: Ward }>>('/inpatient/wards', payload);
  return data.data.ward;
};

export const getWardById = async (
  id: string
): Promise<{ ward: Ward; beds: HospitalBed[] }> => {
  const { data } = await api.get<ApiResponse<{ ward: Ward; beds: HospitalBed[] }>>(
    `/inpatient/wards/${id}`
  );
  return data.data;
};

export const updateWard = async (
  id: string,
  payload: Partial<{ name: string; type: string; department: string; floor: string; description: string }>
): Promise<Ward> => {
  const { data } = await api.patch<ApiResponse<{ ward: Ward }>>(
    `/inpatient/wards/${id}`,
    payload
  );
  return data.data.ward;
};

export const updateWardStatus = async (
  id: string,
  status: 'active' | 'inactive'
): Promise<Ward> => {
  const { data } = await api.patch<ApiResponse<{ ward: Ward }>>(`/inpatient/wards/${id}/status`, {
    status,
  });
  return data.data.ward;
};

// --- Beds ---

export const getBeds = async (
  params: { page?: number; limit?: number; wardId?: string; status?: string } = {}
): Promise<BedsListData> => {
  const { data } = await api.get<ApiResponse<BedsListData>>('/inpatient/beds', { params });
  return data.data;
};

export const createBed = async (payload: {
  wardId: string;
  bedNumber: string;
  bedType?: string;
}): Promise<HospitalBed> => {
  const { data } = await api.post<ApiResponse<{ bed: HospitalBed }>>('/inpatient/beds', payload);
  return data.data.bed;
};

export const updateBedStatus = async (id: string, status: string): Promise<HospitalBed> => {
  const { data } = await api.patch<ApiResponse<{ bed: HospitalBed }>>(
    `/inpatient/beds/${id}/status`,
    { status }
  );
  return data.data.bed;
};

// --- Admissions ---

export const admitPatient = async (payload: AdmitPatientPayload): Promise<Admission> => {
  const { data } = await api.post<ApiResponse<{ admission: Admission }>>(
    '/inpatient/admissions',
    payload
  );
  return data.data.admission;
};

export const getAdmissions = async (params: AdmissionsQuery = {}): Promise<AdmissionsListData> => {
  const { data } = await api.get<ApiResponse<AdmissionsListData>>('/inpatient/admissions', {
    params,
  });
  return data.data;
};

export const getAdmissionById = async (
  id: string
): Promise<{ admission: Admission; transfers: BedTransfer[] }> => {
  const { data } = await api.get<ApiResponse<{ admission: Admission; transfers: BedTransfer[] }>>(
    `/inpatient/admissions/${id}`
  );
  return data.data;
};

// --- Transfers & discharge ---

export const transferPatient = async (payload: {
  admissionId: string;
  toWardId: string;
  toBedId: string;
  reason?: string;
}): Promise<BedTransfer> => {
  const { data } = await api.post<ApiResponse<{ transfer: BedTransfer }>>(
    '/inpatient/transfers',
    payload
  );
  return data.data.transfer;
};

export const getTransfers = async (
  params: { page?: number; limit?: number; admissionId?: string; patientId?: string } = {}
): Promise<{ transfers: BedTransfer[]; pagination: Pagination }> => {
  const { data } = await api.get<ApiResponse<{ transfers: BedTransfer[]; pagination: Pagination }>>(
    '/inpatient/transfers',
    { params }
  );
  return data.data;
};

export const dischargePatient = async (payload: {
  admissionId: string;
  notes?: string;
  outcome?: 'discharged' | 'cancelled';
}): Promise<Admission> => {
  const { data } = await api.post<ApiResponse<{ admission: Admission }>>(
    '/inpatient/discharges',
    payload
  );
  return data.data.admission;
};

// --- Stats ---

export const getInpatientStats = async (): Promise<InpatientStats> => {
  const { data } = await api.get<ApiResponse<InpatientStats>>('/inpatient/stats');
  return data.data;
};
