/**
 * Production API & Socket Configuration
 * Reads from environment variables (VITE_API_URL / VITE_SOCKET_URL)
 * for cross-domain static frontends (e.g. Cloudflare Workers) communicating with the Render backend,
 * while automatically falling back to relative paths in local/preview environments.
 */

const DEFAULT_RENDER_BACKEND = 'https://yabede-bingo-one.onrender.com';

const getEnvVar = (key: string): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    return (import.meta.env[key] as string).trim();
  }
  return '';
};

/**
 * Checks if the frontend is currently running in a local development
 * or AI Studio preview container (same-origin backend on port 3000).
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

// Base Backend URLs from environment variables (falling back to production Render backend in cross-origin production)
const rawApiUrl = getEnvVar('VITE_API_URL').replace(/\/+$/, '');
const rawSocketUrl = getEnvVar('VITE_SOCKET_URL').replace(/\/+$/, '');

export const VITE_API_URL = rawApiUrl;
export const VITE_SOCKET_URL = rawSocketUrl || rawApiUrl;

/**
 * Resolves full API endpoint URL
 * - When VITE_API_URL is configured: returns 'https://<RENDER-BACKEND-URL>/api/...'
 * - In local dev / AI Studio preview (without custom VITE_API_URL): returns relative path '/api/...'
 * - In production static deployment: returns 'https://yabede-bingo-one.onrender.com/api/...'
 */
export function apiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (VITE_API_URL) {
    return `${VITE_API_URL}${cleanPath}`;
  }
  if (isLocalOrPreviewEnvironment()) {
    return cleanPath;
  }
  // Production fallback to the Render backend
  return `${DEFAULT_RENDER_BACKEND}${cleanPath}`;
}

/**
 * Resolves Socket.IO server connection URL
 * - When VITE_SOCKET_URL is configured: returns 'https://<RENDER-BACKEND-URL>'
 * - In local dev / AI Studio preview: returns same-origin or relative
 * - In production static deployment: returns 'https://yabede-bingo-one.onrender.com'
 */
export function getSocketUrl(): string {
  if (VITE_SOCKET_URL) {
    return VITE_SOCKET_URL;
  }
  if (isLocalOrPreviewEnvironment()) {
    return typeof window !== 'undefined' ? window.location.origin : '';
  }
  return DEFAULT_RENDER_BACKEND;
}


