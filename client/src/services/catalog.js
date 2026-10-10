import { request } from './http.js';

export const catalogApi = {
  list: (query, signal) => request('/api/products', { query, signal }).then((r) => ({ items: r.data, ...r.meta })),
  get: (slug, signal) => request(`/api/products/${encodeURIComponent(slug)}`, { signal }).then((r) => r.data),
  categories: (gender, signal) => request('/api/categories', { query: { gender }, signal }).then((r) => r.data),
  collection: (slug, signal) => request(`/api/collections/${encodeURIComponent(slug)}`, { signal }).then((r) => r.data),
  collections: (signal) => request('/api/collections', { signal }).then((r) => r.data),
};
