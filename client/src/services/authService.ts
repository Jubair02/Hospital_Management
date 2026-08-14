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

/**
 * Sign-out is the one call that races its own credentials. The caller drops
 * the token the moment it fires, but the request interceptor that normally
 * attaches the header does not run until a microtask later — by which point
 * the token is gone, the server answers 401, and the `logout` entry never
 * reaches the audit trail. Passing it explicitly lets the caller clear
 * storage in the same tick without disarming the request.
 */
export const logoutRequest = (token: string | null): Promise<unknown> =>
  api.post(
    '/auth/logout',
    null,
    token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
  );

/** Changes the signed-in user's own password (current password required). */
export const changePasswordRequest = async (
  currentPassword: string,
  newPassword: string
): Promise<void> => {
  await api.post('/auth/change-password', { currentPassword, newPassword });
};
