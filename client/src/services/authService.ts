import api from './api';
import type { ApiResponse, LoginData, User } from '../types';

export const loginRequest = async (email: string, password: string): Promise<LoginData> => {
  const { data } = await api.post<ApiResponse<LoginData>>('/auth/login', { email, password });
  return data.data; // { token, user }
};

export const getMeRequest = async (): Promise<User> => {
  const { data } = await api.get<ApiResponse<{ user: User }>>('/auth/me');
  return data.data.user;
};

export const logoutRequest = (): Promise<unknown> => api.post('/auth/logout');

/** Changes the signed-in user's own password (current password required). */
export const changePasswordRequest = async (
  currentPassword: string,
  newPassword: string
): Promise<void> => {
  await api.post('/auth/change-password', { currentPassword, newPassword });
};
