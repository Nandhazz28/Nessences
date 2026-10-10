// Business rules. All amounts are integer paise. Change here, not in components.
export const COMMERCE = {
  currency: 'INR',
  freeShippingThreshold: 500000, // ₹5,000 (after discount)
  shippingFee: 29900,            // ₹299
  taxRate: 0.05,                 // 5% GST, added on top of the discounted subtotal
  maxLineQty: 10,
  guestCartDays: 30,
  reservationMinutes: 30,        // how long stock is held while the customer pays
  delivery: {
    standard: { label: 'Standard delivery', eta: '4–6 business days' }, // fee follows the free-shipping rule
    express: { label: 'Express delivery', eta: '1–2 business days', fee: 49900 },
  },
};
