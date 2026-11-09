const Payment = require('../models/Payment');
const Job = require('../models/Job');
const User = require('../models/User');
const { escapeRegex } = require('../utils/regex');
const { featuredActiveExpr } = require('../utils/featured');
const v = require('../validators/paymentValidator');

const asyncHandler = require('../utils/asyncHandler');

// GET /api/admin/payments?status=&search=&page=&limit=   (read-only: there is deliberately no "mark as paid")
exports.listPayments = asyncHandler(async (req, res) => {
  const { page, limit, status, search } = v.adminPaymentsQuery.parse(req.query);
  const match = {};
  if (status) match.status = status;
  const rx = search ? new RegExp(escapeRegex(search), 'i') : null;

  const [out] = await Payment.aggregate([
    { $match: match },
    { $lookup: { from: User.collection.name, localField: 'employerId', foreignField: '_id', as: 'employer' } },
    { $unwind: { path: '$employer', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: Job.collection.name, localField: 'jobId', foreignField: '_id', as: 'job' } },
    { $unwind: { path: '$job', preserveNullAndEmptyArrays: true } },
    ...(rx ? [{ $match: { $or: [{ razorpayOrderId: rx }, { razorpayPaymentId: rx }, { 'employer.email': rx }, { 'employer.name': rx }, { 'job.title': rx }] } }] : []),
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $facet: {
        rows: [
          { $skip: (page - 1) * limit }, { $limit: limit },
          { $project: {
            amount: 1, currency: 1, status: 1, purpose: 1, razorpayOrderId: 1, razorpayPaymentId: 1, failureReason: 1, activationNote: 1,
            createdAt: 1, verifiedAt: 1, featuredStartsAt: 1, featuredEndsAt: 1, activatedAt: 1,
            'employer._id': 1, 'employer.name': 1, 'employer.email': 1, 'job._id': 1, 'job.title': 1, 'job.company': 1, 'job.status': 1,
          } },
        ],
        total: [{ $count: 'n' }],
      },
    },
  ]);
  const total = out.total[0]?.n || 0;
  res.json({ success: true, message: 'Payments retrieved', data: out.rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// GET /api/admin/payments/summary: only confirmed (paid) payments count as revenue.
exports.paymentSummary = asyncHandler(async (_req, res) => {
  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 864e5);
  const [byStatus, last30, needsReview, active] = await Promise.all([
    Payment.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
    Payment.aggregate([{ $match: { status: 'paid', verifiedAt: { $gte: monthAgo } } }, { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    Payment.countDocuments({ status: 'paid', activationNote: { $exists: true } }),
    Job.aggregate([
      { $match: { isFeatured: true } },
      { $match: { $expr: featuredActiveExpr(now) } },
      { $sort: { featuredUntil: 1 } },
      { $facet: {
        count: [{ $count: 'n' }],
        items: [{ $limit: 20 }, { $lookup: { from: User.collection.name, localField: 'employerId', foreignField: '_id', as: 'employer' } }, { $unwind: { path: '$employer', preserveNullAndEmptyArrays: true } },
          { $project: { title: 1, company: 1, featuredAt: 1, featuredUntil: 1, 'employer.name': 1, 'employer.email': 1 } }],
      } },
    ]),
  ]);
  const get = (s) => byStatus.find((b) => b._id === s) || { count: 0, amount: 0 };
  res.json({
    success: true, message: 'Payment summary',
    data: {
      currency: 'INR',
      revenue: { total: get('paid').amount, last30Days: last30[0]?.amount || 0, paidCount: get('paid').count },
      counts: { paid: get('paid').count, pending: get('pending').count + get('created').count, awaitingConfirmation: get('pending').count, created: get('created').count, failed: get('failed').count },
      needsReview,
      activePromotions: { count: active[0].count[0]?.n || 0, items: active[0].items },
    },
  });
});
