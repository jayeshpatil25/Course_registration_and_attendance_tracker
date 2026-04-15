import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// Attach JWT to every request (reads fresh from sessionStorage each time)
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401, only redirect if user was actually logged in (had a token)
// This prevents the refresh-logout bug where API calls fire before
// React state is hydrated from sessionStorage.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Only clear storage + redirect if a token existed (genuine expiry)
      // If no token was attached, do NOT wipe storage — React will hydrate it.
      const hadToken = err.config?.headers?.Authorization;
      if (hadToken) {
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        window.location.href = '/';
      }
    }
    return Promise.reject(err);
  }
);

export default api;

