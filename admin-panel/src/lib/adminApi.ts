import { apiUrl } from '@shared/apiConfig';

export function getAdminToken(): string {
  return (
    sessionStorage.getItem('ahun_admin_token') ||
    localStorage.getItem('ahun_admin_token') ||
    ''
  );
}

export async function adminFetch(
  endpoint: string,
  init?: RequestInit
): Promise<Response> {
  const token = getAdminToken();
  const headers = new Headers(init?.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('x-admin-token', token);
  }

  const url = endpoint.startsWith('http') ? endpoint : apiUrl(endpoint);

  const res = await fetch(url, {
    ...init,
    headers,
  });

  if (res.status === 401) {
    const errorData = await res.clone().json().catch(() => ({}));
    if (errorData.code === 'auth/token-expired') {
      console.warn('Admin token expired, clearing session.');
    }
  }

  return res;
}
