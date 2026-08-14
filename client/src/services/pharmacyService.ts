import api from './api';
import type {
  ApiResponse,
  DispensePayload,
  DispensingListData,
  DispensingRecord,
  InventoryBatch,
  InventoryListData,
  Medicine,
  MedicineCategory,
  MedicinePayload,
  MedicinesListData,
  PharmacyPrescription,
  PharmacyPrescriptionsData,
  PharmacyStats,
  PrescriptionFulfillment,
  StockInPayload,
  TransactionsListData,
} from '../types';

// --- Categories ---

export const getCategories = async (): Promise<MedicineCategory[]> => {
  const { data } = await api.get<ApiResponse<{ categories: MedicineCategory[] }>>(
    '/pharmacy/categories'
  );
  return data.data.categories;
};

export const createCategory = async (payload: {
  name: string;
  description?: string;
}): Promise<MedicineCategory> => {
  const { data } = await api.post<ApiResponse<{ category: MedicineCategory }>>(
    '/pharmacy/categories',
    payload
  );
  return data.data.category;
};

export const updateCategory = async (
  id: string,
  payload: { name?: string; description?: string }
): Promise<MedicineCategory> => {
  const { data } = await api.patch<ApiResponse<{ category: MedicineCategory }>>(
    `/pharmacy/categories/${id}`,
    payload
  );
  return data.data.category;
};

export const updateCategoryStatus = async (
  id: string,
  status: 'active' | 'inactive'
): Promise<MedicineCategory> => {
  const { data } = await api.patch<ApiResponse<{ category: MedicineCategory }>>(
    `/pharmacy/categories/${id}/status`,
    { status }
  );
  return data.data.category;
};

// --- Medicines ---

export interface MedicinesQuery {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  status?: string;
  stock?: 'low';
}

export const getMedicines = async (params: MedicinesQuery = {}): Promise<MedicinesListData> => {
  const { data } = await api.get<ApiResponse<MedicinesListData>>('/pharmacy/medicines', {
    params,
  });
  return data.data;
};

export const getMedicineById = async (
  id: string
): Promise<{ medicine: Medicine; batches: InventoryBatch[] }> => {
  const { data } = await api.get<ApiResponse<{ medicine: Medicine; batches: InventoryBatch[] }>>(
    `/pharmacy/medicines/${id}`
  );
  return data.data;
};

export const createMedicine = async (payload: MedicinePayload): Promise<Medicine> => {
  const { data } = await api.post<ApiResponse<{ medicine: Medicine }>>(
    '/pharmacy/medicines',
    payload
  );
  return data.data.medicine;
};

export const updateMedicine = async (
  id: string,
  payload: Partial<MedicinePayload>
): Promise<Medicine> => {
  const { data } = await api.patch<ApiResponse<{ medicine: Medicine }>>(
    `/pharmacy/medicines/${id}`,
    payload
  );
  return data.data.medicine;
};

export const updateMedicineStatus = async (
  id: string,
  status: 'active' | 'inactive'
): Promise<Medicine> => {
  const { data } = await api.patch<ApiResponse<{ medicine: Medicine }>>(
    `/pharmacy/medicines/${id}/status`,
    { status }
  );
  return data.data.medicine;
};

// --- Inventory ---

export interface InventoryQuery {
  page?: number;
  limit?: number;
  medicineId?: string;
  view?: 'expired' | 'expiring_soon' | 'depleted' | 'in_stock';
}

export const getInventory = async (params: InventoryQuery = {}): Promise<InventoryListData> => {
  const { data } = await api.get<ApiResponse<InventoryListData>>('/pharmacy/inventory', {
    params,
  });
  return data.data;
};

export const stockIn = async (payload: StockInPayload): Promise<InventoryBatch> => {
  const { data } = await api.post<ApiResponse<{ batch: InventoryBatch }>>(
    '/pharmacy/inventory',
    payload
  );
  return data.data.batch;
};

export const adjustStock = async (
  batchId: string,
  payload: { quantityChange: number; type?: 'adjustment' | 'return' | 'expiry'; notes?: string }
): Promise<InventoryBatch> => {
  const { data } = await api.patch<ApiResponse<{ batch: InventoryBatch }>>(
    `/pharmacy/inventory/${batchId}/adjust`,
    payload
  );
  return data.data.batch;
};

// --- Transactions ---

export const getTransactions = async (
  params: { page?: number; limit?: number; type?: string; medicineId?: string } = {}
): Promise<TransactionsListData> => {
  const { data } = await api.get<ApiResponse<TransactionsListData>>('/pharmacy/transactions', {
    params,
  });
  return data.data;
};

// --- Prescriptions & dispensing ---

export const getPharmacyPrescriptions = async (
  params: { page?: number; limit?: number; search?: string } = {}
): Promise<PharmacyPrescriptionsData> => {
  const { data } = await api.get<ApiResponse<PharmacyPrescriptionsData>>(
    '/pharmacy/prescriptions',
    { params }
  );
  return data.data;
};

export const getPharmacyPrescriptionById = async (
  id: string
): Promise<{
  consultation: PharmacyPrescription;
  fulfillments: PrescriptionFulfillment[];
  dispensings: DispensingRecord[];
}> => {
  const { data } = await api.get<
    ApiResponse<{
      consultation: PharmacyPrescription;
      fulfillments: PrescriptionFulfillment[];
      dispensings: DispensingRecord[];
    }>
  >(`/pharmacy/prescriptions/${id}`);
  return data.data;
};

export const dispenseMedicines = async (payload: DispensePayload): Promise<DispensingRecord> => {
  const { data } = await api.post<ApiResponse<{ record: DispensingRecord }>>(
    '/pharmacy/dispensing',
    payload
  );
  return data.data.record;
};

export const getDispensings = async (
  params: { page?: number; limit?: number; consultationId?: string; patientId?: string } = {}
): Promise<DispensingListData> => {
  const { data } = await api.get<ApiResponse<DispensingListData>>('/pharmacy/dispensing', {
    params,
  });
  return data.data;
};

// --- Stats ---

export const getPharmacyStats = async (): Promise<PharmacyStats> => {
  const { data } = await api.get<ApiResponse<PharmacyStats>>('/pharmacy/stats');
  return data.data;
};
