// Pricing and product rules live on the server only. The frontend asks GET /api/payments/config for them.
// Change the price or duration with environment variables (no code change, no frontend change).
const int = (v, fallback) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const featuredJob = () => ({
  purpose: 'featured_job',
  amount: int(process.env.FEATURED_PRICE_PAISE, 49900), // paise: 49900 = INR 499.00
  currency: 'INR',
  days: int(process.env.FEATURED_DAYS, 7),
});

// An unpaid order older than this is treated as abandoned (a fresh order is created instead of reusing it).
const ORDER_REUSE_MINUTES = 30;

module.exports = { featuredJob, ORDER_REUSE_MINUTES };
