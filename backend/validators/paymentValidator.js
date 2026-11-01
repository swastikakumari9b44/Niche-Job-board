const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

// strictObject: a client-supplied amount, currency, employerId, etc. is rejected, never ignored.
const createOrderBody = z.strictObject({ jobId: objectId });

const verifyBody = z.strictObject({
  paymentRecordId: objectId,
  razorpay_order_id: z.string().regex(/^order_[A-Za-z0-9]+$/, 'Invalid order id').max(64),
  razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]+$/, 'Invalid payment id').max(64),
  razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/i, 'Invalid signature'),
});

const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(50).default(10);
const myPaymentsQuery = z.object({ page, limit });
const adminPaymentsQuery = z.object({
  page, limit,
  status: z.enum(['created', 'pending', 'paid', 'failed']).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

module.exports = { createOrderBody, verifyBody, myPaymentsQuery, adminPaymentsQuery };
