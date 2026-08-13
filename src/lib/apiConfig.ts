/**
 * Production API & Socket Configuration
 * Allows Netlify static frontend to communicate with persistent Render backend
 */

const getEnvVar = (key: string): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key] as string;
  }
  return '';
};

// Base Backend URLs
export const VITE_API_URL = getEnvVar('VITE_API_URL').replace(/\/+$/, '');
export const VITE_SOCKET_URL =
  getEnvVar('VITE_SOCKET_URL').replace(/\/+$/, '') ||
  VITE_API_URL ||
  (typeof window !== 'undefined' ? window.location.origin : '');

/**
 * Resolves full API endpoint URL
 * In dev (empty VITE_API_URL): returns relative path e.g. '/api/health'
 * In prod (e.g. VITE_API_URL = 'https://yabede-bingo-one.onrender.com'): returns 'https://yabede-bingo-one.onrender.com/api/health'
 */
export function apiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (VITE_API_URL) {
    return `${VITE_API_URL}${cleanPath}`;
  }
  return cleanPath;
}
