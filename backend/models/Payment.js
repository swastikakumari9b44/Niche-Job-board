const mongoose = require('mongoose');

const OPEN = ['created', 'pending'];

const paymentSchema = new mongoose.Schema(
  {
    employerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    razorpayOrderId: { type: String, required: true, unique: true },
    razorpayPaymentId: { type: String }, // set once a payment attempt is verified/confirmed
    amount: { type: Number, required: true, min: 1 }, // paise, decided by the server
    currency: { type: String, required: true, default: 'INR', uppercase: true, maxlength: 3 },
    // created = order made, pending = checkout finished but capture not yet confirmed, paid = capture confirmed, failed
    status: { type: String, enum: ['created', 'pending', 'paid', 'failed'], default: 'created' },
    purpose: { type: String, enum: ['featured_job'], default: 'featured_job' },
    featuredDays: { type: Number, required: true, min: 1 }, // snapshot of the plan that was bought
    failureReason: { type: String, maxlength: 300 },
    verifiedAt: Date, // when a trusted source (Razorpay API or signed webhook) confirmed capture
    activatedAt: Date, // when the featured placement was switched on
    featuredStartsAt: Date,
    featuredEndsAt: Date,
    activationNote: { type: String, maxlength: 300 }, // e.g. paid but job was closed: needs manual review/refund
  },
  { timestamps: true }
);

// A payment id can belong to one record only.
paymentSchema.index({ razorpayPaymentId: 1 }, { unique: true, partialFilterExpression: { razorpayPaymentId: { $type: 'string' } } });
// At most ONE open (unpaid) order per employer+job+purpose: makes double-clicks and parallel requests safe.
paymentSchema.index({ employerId: 1, jobId: 1, purpose: 1 }, { unique: true, partialFilterExpression: { status: { $in: OPEN } } });
paymentSchema.index({ employerId: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ jobId: 1 });
paymentSchema.index({ status: 1, verifiedAt: -1 }); // revenue by date (paid only)
paymentSchema.index({ employerId: 1, status: 1 }); // employer spend

module.exports = mongoose.model('Payment', paymentSchema);
module.exports.OPEN = OPEN;
