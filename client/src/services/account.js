import { request } from './http.js';

const d = (p) => p.then((r) => r.data);
export const accountApi = {
  updateProfile: (body) => d(request('/api/account/profile', { method: 'PATCH', body })),
  setPrefs: (body) => d(request('/api/account/preferences', { method: 'PUT', body })),
  sessions: () => d(request('/api/account/sessions')),
  signOutEverywhere: () => request('/api/account/sessions', { method: 'DELETE' }),
  deleteAccount: (password) => request('/api/account/delete-account', { method: 'POST', body: { password } }),
  notifications: () => d(request('/api/account/notifications')),
  readAll: () => request('/api/account/notifications/read-all', { method: 'POST' }),
  returns: () => d(request('/api/account/returns')),
  returnById: (id) => d(request(`/api/account/returns/${id}`)),
  createReturn: (body) => d(request('/api/account/returns', { method: 'POST', body })),
  withdrawReturn: (id) => d(request(`/api/account/returns/${id}/cancel`, { method: 'POST' })),
};
export const ordersApi = {
  list: (page = 1) => request('/api/orders', { query: { page } }).then((r) => r.data),
  get: (id) => d(request(`/api/orders/${id}`)),
  cancel: (id) => d(request(`/api/orders/${id}/cancel`, { method: 'POST' })),
};
