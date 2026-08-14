import api from './api';
import type {
  ApiResponse,
  CreateUserPayload,
  UpdateUserPayload,
  User,
  UsersListData,
  UsersQuery,
  UserStatus,
} from '../types';

export const fetchUsers = async (params: UsersQuery = {}): Promise<UsersListData> => {
  const { data } = await api.get<ApiResponse<UsersListData>>('/users', { params });
  return data.data; // { users, pagination }
};

export const fetchUserById = async (id: string): Promise<User> => {
  const { data } = await api.get<ApiResponse<{ user: User }>>(`/users/${id}`);
  return data.data.user;
};

export const createUser = async (payload: CreateUserPayload): Promise<User> => {
  const { data } = await api.post<ApiResponse<{ user: User }>>('/users', payload);
  return data.data.user;
};

export const updateUser = async (id: string, payload: UpdateUserPayload): Promise<User> => {
  const { data } = await api.patch<ApiResponse<{ user: User }>>(`/users/${id}`, payload);
  return data.data.user;
};

/**
 * Removes a staff login. The server refuses accounts that already own
 * clinical or financial records and explains what blocked it, so callers
 * should surface the error message rather than a generic failure.
 */
export const deleteUser = async (id: string): Promise<void> => {
  await api.delete<ApiResponse<{ id: string }>>(`/users/${id}`);
};

/**
 * Sets an account's status. Accepts the three-state value; the backend keeps
 * the legacy `isActive` flag in sync.
 */
export const updateUserStatus = async (id: string, status: UserStatus): Promise<User> => {
  const { data } = await api.patch<ApiResponse<{ user: User }>>(`/users/${id}/status`, {
    status,
  });
  return data.data.user;
};
