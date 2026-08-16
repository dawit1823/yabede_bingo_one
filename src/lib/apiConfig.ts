/**
 * Production API & Socket Configuration
 * Allows Netlify static frontend to communicate with persistent Render backend,
 * while automatically falling back to relative paths in local/preview environments.
 */

const getEnvVar = (key: string): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    return (import.meta.env[key] as string).trim();
  }
  return '';
};

/**
 * Checks if the frontend is currently running in a local development
 * or AI Studio preview container (same-origin backend).
 */
const isLocalOrPreviewEnvironment = (): boolean => {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.includes('run.app') ||
    hostname.includes('webcontainer')
  );
};

// Base Backend URLs
export const VITE_API_URL = getEnvVar('VITE_API_URL').replace(/\/+$/, '');
export const VITE_SOCKET_URL =
  getEnvVar('VITE_SOCKET_URL').replace(/\/+$/, '') ||
  VITE_API_URL ||
  (typeof window !== 'undefined' ? window.location.origin : '');

/**
 * Resolves full API endpoint URL
 * - In local dev / AI Studio preview: returns relative path e.g. '/api/health'
 * - In Netlify production: returns 'https://yabede-bingo-one.onrender.com/api/health'
 */
export function apiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (isLocalOrPreviewEnvironment()) {
    return cleanPath;
  }
  if (VITE_API_URL) {
    return `${VITE_API_URL}${cleanPath}`;
  }
  return cleanPath;
}

/**
 * Resolves Socket.IO server connection URL
 */
export function getSocketUrl(): string {
  if (isLocalOrPreviewEnvironment()) {
    return typeof window !== 'undefined' ? window.location.origin : '';
  }
  return VITE_SOCKET_URL;
}
