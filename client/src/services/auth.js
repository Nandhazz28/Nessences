import { request } from './http.js';

export const authApi = {
  me: () => request('/api/auth/me').then((r) => r.data.user),
  register: (b) => request('/api/auth/register', { method: 'POST', body: b }).then((r) => r.data),
  login: (b) => request('/api/auth/login', { method: 'POST', body: b }).then((r) => r.data.user),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  verifyEmail: (token) => request('/api/auth/verify-email', { method: 'POST', body: { token } }),
  resend: (email) => request('/api/auth/resend-verification', { method: 'POST', body: { email } }),
  forgot: (email) => request('/api/auth/forgot-password', { method: 'POST', body: { email } }).then((r) => r.data),
  changePassword: (currentPassword, newPassword) => request('/api/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),
  reset: (token, password) => request('/api/auth/reset-password', { method: 'POST', body: { token, password } }),
};
