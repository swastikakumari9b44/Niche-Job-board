// Date-range handling for analytics. Everything is calculated in UTC so results are identical for every viewer
// and every server timezone. Buckets are zero-filled so charts never skip days.
const DAY = 864e5;
const MAX_CUSTOM_DAYS = 366;
const PRESET_DAYS = { '7d': 7, '30d': 30, '90d': 90 };

const startOfUTCDay = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const parseDay = (s) => new Date(`${s}T00:00:00.000Z`);
const isoDay = (d) => d.toISOString().slice(0, 10);
const isoMonth = (d) => d.toISOString().slice(0, 7);

// q: { range: '7d'|'30d'|'90d'|'12m'|'custom'|'all', from, to }.  opts.since: start used when range === 'all'.
function parseRange(q = {}, now = new Date(), opts = {}) {
  const range = q.range || '30d';
  let from, to;
  if (PRESET_DAYS[range]) {
    from = new Date(startOfUTCDay(now).getTime() - (PRESET_DAYS[range] - 1) * DAY);
    to = now;
  } else if (range === '12m') {
    from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
    to = now;
  } else if (range === 'custom') {
    from = parseDay(q.from);
    const endOfToDay = new Date(parseDay(q.to).getTime() + DAY - 1);
    to = endOfToDay > now ? now : endOfToDay; // never extend into the future
  } else if (range === 'all' && opts.since) {
    from = startOfUTCDay(new Date(opts.since));
    to = now;
  } else {
    throw new Error(`Unsupported range: ${range}`);
  }
  const spanDays = Math.max(1, Math.ceil((to - from) / DAY));
  const granularity = spanDays <= 92 ? 'day' : 'month';

  const buckets = [];
  if (granularity === 'day') {
    for (let t = startOfUTCDay(from).getTime(); t <= to.getTime(); t += DAY) buckets.push(isoDay(new Date(t)));
  } else {
    const c = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
    while (c <= to) { buckets.push(isoMonth(c)); c.setUTCMonth(c.getUTCMonth() + 1); }
  }
  return { range, from, to, granularity, spanDays, buckets };
}

// $group key expression for a date field, matching the bucket keys above.
const bucketExpr = (granularity, field = '$createdAt') => ({
  $dateToString: { format: granularity === 'day' ? '%Y-%m-%d' : '%Y-%m', date: field, timezone: 'UTC' },
});

// rows: [{ _id: bucketKey, ...numbers }]  ->  [{ key, ...numbers }] with a row (zeros) for every bucket.
function fillSeries(buckets, rows, fields) {
  const byKey = new Map(rows.map((r) => [r._id, r]));
  return buckets.map((key) => {
    const r = byKey.get(key) || {};
    return { key, ...Object.fromEntries(fields.map((f) => [f, r[f] || 0])) };
  });
}

const rangeInfo = (r) => ({ range: r.range, from: r.from.toISOString(), to: r.to.toISOString(), granularity: r.granularity, timezone: 'UTC' });

module.exports = { parseRange, bucketExpr, fillSeries, rangeInfo, startOfUTCDay, MAX_CUSTOM_DAYS, DAY };
