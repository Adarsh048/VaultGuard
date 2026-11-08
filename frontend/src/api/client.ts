import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for session expiration handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !window.location.pathname.includes('/login')) {
      // Clear local state if any and redirect to login
      localStorage.removeItem('vaultguard_user');
      window.location.href = '/login?sessionExpired=true';
    }
    return Promise.reject(error);
  }
);

