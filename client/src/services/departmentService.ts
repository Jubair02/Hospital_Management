import api from './api';
import type { ApiResponse, Department } from '../types';

export const getDepartments = async (params: { status?: string } = {}): Promise<Department[]> => {
  const { data } = await api.get<ApiResponse<{ departments: Department[] }>>('/departments', {
    params,
  });
  return data.data.departments;
};

export const createDepartment = async (payload: {
  name: string;
  description?: string;
}): Promise<Department> => {
  const { data } = await api.post<ApiResponse<{ department: Department }>>(
    '/departments',
    payload
  );
  return data.data.department;
};

export const updateDepartment = async (
  id: string,
  payload: { name?: string; description?: string }
): Promise<Department> => {
  const { data } = await api.patch<ApiResponse<{ department: Department }>>(
    `/departments/${id}`,
    payload
  );
  return data.data.department;
};

export const updateDepartmentStatus = async (
  id: string,
  status: 'active' | 'inactive'
): Promise<Department> => {
  const { data } = await api.patch<ApiResponse<{ department: Department }>>(
    `/departments/${id}/status`,
    { status }
  );
  return data.data.department;
};
