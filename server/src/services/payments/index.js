import { razorpay } from './razorpay.js';

// The rest of the app talks only to this interface. To switch gateway, add a module with the same shape.
export const getPaymentProvider = () => razorpay;
export { PaymentProviderError } from './razorpay.js';
