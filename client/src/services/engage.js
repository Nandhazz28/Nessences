import { request } from './http.js';

const d = (p) => p.then((r) => r.data);
export const contentApi = {
  page: (key, signal) => d(request(`/api/content/${key}`, { signal })),
  settings: (signal) => d(request('/api/settings/public', { signal })),
};
export const newsletterApi = {
  subscribe: (email, source = 'footer') => d(request('/api/newsletter', { method: 'POST', body: { email, source } })),
  confirm: (token) => d(request('/api/newsletter/confirm', { method: 'POST', body: { token } })),
  unsubscribe: (token) => d(request('/api/newsletter/unsubscribe', { method: 'POST', body: { token } })),
};

export const contactApi = {
  submit: (body) => d(request('/api/contact', { method: 'POST', body })),
  track: (orderNumber, email) => d(request('/api/track-order', { method: 'POST', body: { orderNumber, email } })),
};
export const journalApi = {
  list: (query, signal) => request('/api/journal', { query, signal }).then((r) => ({ items: r.data, ...r.meta })),
  get: (slug, signal) => d(request(`/api/journal/${encodeURIComponent(slug)}`, { signal })),
};

export const reviewsApi = {
  list: (slug, query, signal) => request(`/api/products/${encodeURIComponent(slug)}/reviews`, { query, signal }).then((r) => ({ ...r.data, pagination: r.meta.pagination })),
  create: (slug, body) => d(request(`/api/products/${encodeURIComponent(slug)}/reviews`, { method: 'POST', body })),
  update: (id, body) => d(request(`/api/reviews/${id}`, { method: 'PATCH', body })),
  remove: (id) => d(request(`/api/reviews/${id}`, { method: 'DELETE' })),
  report: (id, body) => d(request(`/api/reviews/${id}/report`, { method: 'POST', body })),
  mine: (signal) => d(request('/api/account/reviews', { signal })),
};
