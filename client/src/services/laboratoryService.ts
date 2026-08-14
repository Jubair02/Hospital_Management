import api from './api';
import type {
  ApiResponse,
  CreateLabOrderPayload,
  EnterLabResultPayload,
  LabCategory,
  LabOrder,
  LabOrdersListData,
  LabOrdersQuery,
  LabResult,
  LabResultsListData,
  LabSample,
  LabSamplesListData,
  LabTest,
  LabTestPayload,
  LabTestsListData,
  LaboratoryStats,
} from '../types';

// --- Categories ---

export const getLabCategories = async (): Promise<LabCategory[]> => {
  const { data } = await api.get<ApiResponse<{ categories: LabCategory[] }>>(
    '/laboratory/categories'
  );
  return data.data.categories;
};

export const createLabCategory = async (payload: {
  name: string;
  description?: string;
}): Promise<LabCategory> => {
  const { data } = await api.post<ApiResponse<{ category: LabCategory }>>(
    '/laboratory/categories',
    payload
  );
  return data.data.category;
};

export const updateLabCategory = async (
  id: string,
  payload: { name?: string; description?: string }
): Promise<LabCategory> => {
  const { data } = await api.patch<ApiResponse<{ category: LabCategory }>>(
    `/laboratory/categories/${id}`,
    payload
  );
  return data.data.category;
};

export const updateLabCategoryStatus = async (
  id: string,
  status: 'active' | 'inactive'
): Promise<LabCategory> => {
  const { data } = await api.patch<ApiResponse<{ category: LabCategory }>>(
    `/laboratory/categories/${id}/status`,
    { status }
  );
  return data.data.category;
};

// --- Tests ---

export interface LabTestsQuery {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  status?: string;
  sampleType?: string;
}

export const getLabTests = async (params: LabTestsQuery = {}): Promise<LabTestsListData> => {
  const { data } = await api.get<ApiResponse<LabTestsListData>>('/laboratory/tests', { params });
  return data.data;
};

export const createLabTest = async (payload: LabTestPayload): Promise<LabTest> => {
  const { data } = await api.post<ApiResponse<{ test: LabTest }>>('/laboratory/tests', payload);
  return data.data.test;
};

export const updateLabTest = async (
  id: string,
  payload: Partial<LabTestPayload>
): Promise<LabTest> => {
  const { data } = await api.patch<ApiResponse<{ test: LabTest }>>(
    `/laboratory/tests/${id}`,
    payload
  );
  return data.data.test;
};

export const updateLabTestStatus = async (
  id: string,
  status: 'active' | 'inactive'
): Promise<LabTest> => {
  const { data } = await api.patch<ApiResponse<{ test: LabTest }>>(
    `/laboratory/tests/${id}/status`,
    { status }
  );
  return data.data.test;
};

// --- Orders ---

export const createLabOrder = async (payload: CreateLabOrderPayload): Promise<LabOrder> => {
  const { data } = await api.post<ApiResponse<{ order: LabOrder }>>(
    '/laboratory/orders',
    payload
  );
  return data.data.order;
};

export const getLabOrders = async (params: LabOrdersQuery = {}): Promise<LabOrdersListData> => {
  const { data } = await api.get<ApiResponse<LabOrdersListData>>('/laboratory/orders', {
    params,
  });
  return data.data;
};

export const getLabOrderById = async (
  id: string
): Promise<{ order: LabOrder; samples: LabSample[]; results: LabResult[] }> => {
  const { data } = await api.get<
    ApiResponse<{ order: LabOrder; samples: LabSample[]; results: LabResult[] }>
  >(`/laboratory/orders/${id}`);
  return data.data;
};

export const cancelLabOrder = async (id: string): Promise<LabOrder> => {
  const { data } = await api.patch<ApiResponse<{ order: LabOrder }>>(
    `/laboratory/orders/${id}/status`,
    { status: 'cancelled' }
  );
  return data.data.order;
};

// --- Samples ---

export const getLabSamples = async (
  params: { page?: number; limit?: number; status?: string; orderId?: string } = {}
): Promise<LabSamplesListData> => {
  const { data } = await api.get<ApiResponse<LabSamplesListData>>('/laboratory/samples', {
    params,
  });
  return data.data;
};

export const collectLabSample = async (id: string, notes?: string): Promise<LabSample> => {
  const { data } = await api.patch<ApiResponse<{ sample: LabSample }>>(
    `/laboratory/samples/${id}/collect`,
    { notes }
  );
  return data.data.sample;
};

export const rejectLabSample = async (id: string, reason: string): Promise<LabSample> => {
  const { data } = await api.patch<ApiResponse<{ sample: LabSample }>>(
    `/laboratory/samples/${id}/reject`,
    { reason }
  );
  return data.data.sample;
};

// --- Results ---

export const getLabResults = async (
  params: { page?: number; limit?: number; status?: string; orderId?: string; patientId?: string } = {}
): Promise<LabResultsListData> => {
  const { data } = await api.get<ApiResponse<LabResultsListData>>('/laboratory/results', {
    params,
  });
  return data.data;
};

export const enterLabResult = async (
  id: string,
  payload: EnterLabResultPayload
): Promise<LabResult> => {
  const { data } = await api.patch<ApiResponse<{ result: LabResult }>>(
    `/laboratory/results/${id}`,
    payload
  );
  return data.data.result;
};

export const verifyLabResult = async (id: string): Promise<LabResult> => {
  const { data } = await api.patch<ApiResponse<{ result: LabResult }>>(
    `/laboratory/results/${id}/verify`,
    {}
  );
  return data.data.result;
};

// --- Stats ---

export const getLaboratoryStats = async (): Promise<LaboratoryStats> => {
  const { data } = await api.get<ApiResponse<LaboratoryStats>>('/laboratory/stats');
  return data.data;
};
