import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Helper to extract cookie value
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
  return match ? decodeURIComponent(match[3]) : null;
}

// Request interceptor to attach CSRF token on state-changing requests
api.interceptors.request.use((reqConfig) => {
  const method = reqConfig.method?.toUpperCase();
  if (method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrfToken = getCookie('vaultguard_csrf');
    if (csrfToken && reqConfig.headers) {
      reqConfig.headers['X-CSRF-Token'] = csrfToken;
    }
  }
  return reqConfig;
});

// Response interceptor for session expiration handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !window.location.pathname.includes('/login')) {
      window.location.href = '/login?sessionExpired=true';
    }
    return Promise.reject(error);
  }
);
