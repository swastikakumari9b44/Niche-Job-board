// "Featured" is only active when ALL of these hold; the isFeatured boolean alone is never trusted.
function isFeaturedActive(job, now = new Date()) {
  return !!(
    job &&
    job.isFeatured === true &&
    job.featuredPaymentId &&
    job.featuredUntil && new Date(job.featuredUntil) > now &&
    job.status === 'active' &&
    (job.moderation?.status ?? 'none') === 'none' // flagged or removed jobs get no featured placement
  );
}

// Same rule as an aggregation expression (used to sort featured jobs first BEFORE pagination).
function featuredActiveExpr(now = new Date()) {
  return {
    $and: [
      { $eq: ['$isFeatured', true] },
      { $ne: [{ $ifNull: ['$featuredPaymentId', null] }, null] },
      { $gt: [{ $ifNull: ['$featuredUntil', new Date(0)] }, now] },
      { $eq: ['$status', 'active'] },
      { $eq: [{ $ifNull: ['$moderation.status', 'none'] }, 'none'] },
    ],
  };
}

module.exports = { isFeaturedActive, featuredActiveExpr };
