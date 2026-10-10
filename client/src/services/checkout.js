import { request } from './http.js';

const d = (p) => p.then((r) => r.data);
export const checkoutApi = {
  config: () => d(request('/api/checkout/config')),
  preview: (delivery) => d(request('/api/cart', { query: { delivery } })),
  createOrder: (body) => d(request('/api/checkout/orders', { method: 'POST', body })),
  verify: (orderId, body) => d(request(`/api/orders/${orderId}/verify-payment`, { method: 'POST', body })),
  paymentFailed: (orderId, reason) => request(`/api/orders/${orderId}/payment-failed`, { method: 'POST', body: { reason } }).catch(() => {}),
  order: (id, signal) => d(request(`/api/orders/${id}`, { signal })),
};
export const addressApi = {
  list: () => d(request('/api/account/addresses')),
  create: (body) => d(request('/api/account/addresses', { method: 'POST', body })),
  update: (id, body) => d(request(`/api/account/addresses/${id}`, { method: 'PATCH', body })),
  remove: (id) => d(request(`/api/account/addresses/${id}`, { method: 'DELETE' })),
};

let rzpPromise;
export const loadRazorpay = () => (rzpPromise ??= new Promise((resolve, reject) => {
  if (window.Razorpay) return resolve(window.Razorpay);
  const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.async = true;
  s.onload = () => resolve(window.Razorpay);
  s.onerror = () => { rzpPromise = undefined; reject(new Error('Could not load the secure payment window. Check your connection and try again.')); };
  document.head.appendChild(s);
}));
