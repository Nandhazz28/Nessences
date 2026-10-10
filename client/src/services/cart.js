import { request } from './http.js';

const view = (p) => p.then((r) => r.data);
export const cartApi = {
  get: () => view(request('/api/cart')),
  add: (variantId, qty = 1) => view(request('/api/cart/items', { method: 'POST', body: { variantId, qty } })),
  setQty: (variantId, qty) => view(request(`/api/cart/items/${variantId}`, { method: 'PATCH', body: { qty } })),
  remove: (variantId) => view(request(`/api/cart/items/${variantId}`, { method: 'DELETE' })),
  save: (variantId) => view(request(`/api/cart/items/${variantId}/save`, { method: 'POST' })),
  move: (variantId) => view(request(`/api/cart/saved/${variantId}/move`, { method: 'POST' })),
  applyCoupon: (code) => view(request('/api/cart/coupon', { method: 'POST', body: { code } })),
  removeCoupon: () => view(request('/api/cart/coupon', { method: 'DELETE' })),
};
export const wishlistApi = {
  list: () => view(request('/api/wishlist')),
  add: (productId) => view(request('/api/wishlist', { method: 'POST', body: { productId } })),
  remove: (productId) => view(request(`/api/wishlist/${productId}`, { method: 'DELETE' })),
};
