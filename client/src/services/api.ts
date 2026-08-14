import axios from 'axios';

/** Exported so other tabs can recognise this key in `storage` events. */
export const TOKEN_KEY = 'hms_token';

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string): void => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY);

/**
 * Resolves the API base URL, tolerating the two ways deploy configs get this
 * wrong.
 *
 * Every request in this client is written relative to the API's `/api` mount
 * (`/auth/login`, `/patients`, …), so the base URL has to end there. Setting
 * `VITE_API_URL` to the bare service origin instead — which is the natural
 * thing to paste from a hosting dashboard — sends every request one level too
 * high, and the only symptom is a 404 like "Route not found: POST /auth/login"
 * that looks like a backend problem rather than a config one. A trailing slash
 * causes a similar off-by-one.
 *
 * Normalising here means both forms work, so the deploy cannot be broken by a
 * pasted URL. It is not a substitute for setting the variable correctly.
 */
const resolveBaseUrl = (): string => {
  const configured = import.meta.env.VITE_API_URL?.trim();
  if (!configured) return '/api';

  const trimmed = configured.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
};

const api = axios.create({
  baseURL: resolveBaseUrl(),
  headers: { 'Content-Type': 'application/json' },
});

// Attach the JWT to every request when present.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// If the API rejects our token (expired, revoked, account deactivated),
// drop it and send the user back to the login page.
api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const isAuthRoute = error.config?.url?.startsWith('/auth/login') ?? false;

      if (status === 401 && !isAuthRoute && getToken()) {
        clearToken();
        if (window.location.pathname !== '/login') {
          window.location.assign('/login');
        }
      }
    }

    return Promise.reject(error);
  }
);

/** Extracts a human-readable message from an Axios error. */
export const getErrorMessage = (
  error: unknown,
  fallback = 'Something went wrong. Please try again.'
): string => {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message || error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
};

export default api;
