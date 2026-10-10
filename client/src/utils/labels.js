export const ORDER_LABEL = { pending_payment: 'Awaiting payment', paid: 'Paid', confirmed: 'Confirmed', processing: 'Processing', packed: 'Packed', shipped: 'Shipped', out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled', refunded: 'Refunded' };
export const RETURN_LABEL = { requested: 'Under review', approved: 'Approved', rejected: 'Not approved', received: 'Received', refunded: 'Refunded', withdrawn: 'Withdrawn' };
export const REASON_LABEL = { wrong_size: 'Wrong size', defective: 'Defective or damaged', not_as_described: 'Not as described', changed_mind: 'Changed my mind', arrived_late: 'Arrived too late', other: 'Other' };
export const REFUND_LABEL = { pending: 'Refund pending', processing: 'Refund processing', processed: 'Refunded', failed: 'Refund needs attention' };
export const date = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
