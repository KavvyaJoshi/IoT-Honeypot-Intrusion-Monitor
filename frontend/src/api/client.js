import axios from 'axios';

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

const ADMIN_TOKEN_KEY = 'honeypot.adminToken';

/**
 * The admin token is typed in by the operator and kept in sessionStorage for the browser tab
 * only. Device keys are never handled by the dashboard.
 */
export function readAdminToken() {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function storeAdminToken(token) {
  try {
    if (token) sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    // Storage unavailable (private mode); the token then lasts until reload only.
  }
}

let memoryToken = readAdminToken();

export function setAdminToken(token) {
  memoryToken = token;
  storeAdminToken(token);
}

export function getAdminToken() {
  return memoryToken;
}

export const http = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 15000,
});

http.interceptors.request.use((config) => {
  if (config.admin) {
    const token = config.adminToken ?? memoryToken;
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** Turns an axios error into a message an operator can act on. */
export function describeError(error) {
  if (!error) return '';
  const apiError = error.response?.data?.error;
  if (apiError?.message) {
    const details = Array.isArray(apiError.details)
      ? apiError.details
          .slice(0, 3)
          .map((d) => (d.path ? `${d.path}: ${d.message}` : d.message))
          .join('; ')
      : '';
    return details ? `${apiError.message} (${details})` : apiError.message;
  }
  if (error.code === 'ECONNABORTED') return 'The backend API did not respond in time.';
  if (!error.response) {
    return `Cannot reach the backend API${API_BASE_URL ? ` at ${API_BASE_URL}` : ''}. Is the backend running on port 4000?`;
  }
  return `Request failed with HTTP ${error.response.status}.`;
}

export function errorCode(error) {
  return error?.response?.data?.error?.code ?? null;
}
