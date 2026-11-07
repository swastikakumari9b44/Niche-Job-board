// Business events -> notifications. Controllers call these fire-and-forget; they never throw.
const Job = require('../models/Job');
const User = require('../models/User');
const { notify, notifyAdmins, background } = require('./notifier');
const { templates: t } = require('./emailTemplates');

// Each event runs in the background from the moment it is called: it never throws, never blocks the request,
// and is tracked so tests (and graceful shutdown) can wait for it.
const safe = (fn) => (...args) => background(() => fn(...args));

exports.onRegistered = safe((user) =>
  notify({ userId: user._id, type: 'welcome', title: 'Welcome to NicheHire', message: user.role === 'employer' ? 'Post your first job for free.' : 'Browse niche roles and apply in minutes.', link: user.role === 'employer' ? '/employer/post' : '/jobs', dedupeKey: `welcome:${user._id}`, mail: t.welcome({ name: user.name, role: user.role }), essential: true }));

exports.onApplicationSubmitted = safe(async ({ application, job, candidate }) => {
  const employer = await User.findById(job.employerId).select('name').lean();
  await Promise.all([
    notify({ userId: candidate._id, type: 'application_submitted', title: 'Application submitted', message: `You applied for ${job.title} at ${job.company}.`, link: '/candidate/dashboard', dedupeKey: `app-submitted:${application._id}`, mail: t.applicationSubmitted({ name: candidate.name, job }), essential: true }),
    employer && notify({ userId: job.employerId, type: 'application_received', title: 'New application', message: `${application.candidateName} applied for ${job.title}.`, link: '/employer/dashboard', dedupeKey: `app-received:${application._id}`, mail: t.newApplication({ employerName: employer.name, candidateName: application.candidateName, job, matchScore: application.matchStatus === 'scored' ? application.matchScore : null }) }),
  ]);
});

exports.onStatusChanged = safe(({ application, job, status }) =>
  notify({ userId: application.candidateId, type: 'application_status', title: `Application ${status.toLowerCase()}`, message: `${job.title} at ${job.company}: ${status}.`, link: '/candidate/dashboard', dedupeKey: `app-status:${application._id}:${status}:${+application.updatedAt}`, mail: t.statusChanged({ name: application.candidateName, job, status }) }));

exports.onPaymentSucceeded = safe(async (payment) => {
  const job = await Job.findById(payment.jobId).select('title employerId').lean();
  const employer = await User.findById(payment.employerId).select('name').lean();
  if (!job || !employer) return;
  const activated = !!payment.activatedAt;
  await notify({ userId: payment.employerId, type: 'payment_succeeded', title: 'Payment successful', message: activated ? `"${job.title}" is now featured.` : `Payment received for "${job.title}".`, link: '/employer/dashboard', dedupeKey: `payment-paid:${payment._id}`, mail: t.paymentSucceeded({ name: employer.name, job, payment, activated }), essential: true });
});

exports.onPaymentFailed = safe(async (payment) => {
  const job = await Job.findById(payment.jobId).select('title').lean();
  await notify({ userId: payment.employerId, type: 'payment_failed', title: 'Payment failed', message: `The payment for "${job?.title ?? 'your job'}" did not go through. You can try again.`, link: '/employer/dashboard', dedupeKey: `payment-failed:${payment._id}` });
});

exports.onPaymentNeedsReview = safe(async (payment) => {
  const job = await Job.findById(payment.jobId).select('title').lean();
  const employer = await User.findById(payment.employerId).select('email').lean();
  await notifyAdmins({ type: 'payment_review', title: 'Payment needs review', message: `A paid listing for "${job?.title ?? 'a job'}" could not be activated.`, link: '/admin/payments', dedupeKey: `payment-review:${payment._id}`, mail: t.paymentReview({ job: job || { title: 'Unknown job' }, payment, employerEmail: employer?.email ?? 'unknown' }), essential: true });
});

exports.onJobModerated = safe(async ({ job, action, reason }) => {
  if (action !== 'remove' && action !== 'restore') return; // flagging is an internal review step: the employer is not told
  const employer = await User.findById(job.employerId).select('name').lean();
  const removed = action === 'remove';
  await notify({ userId: job.employerId, type: 'job_update', title: removed ? 'Job removed by a moderator' : 'Job restored', message: removed ? `"${job.title}" was removed: ${reason}` : `"${job.title}" is live again.`, link: '/employer/dashboard', dedupeKey: `job-${action}:${job._id}:${+job.moderation?.at}`, mail: removed ? t.jobRemoved({ name: employer?.name ?? 'there', job, reason }) : null, essential: true });
});

exports.onAccountStatus = safe(({ user, status, reason }) =>
  notify({ userId: user._id, type: 'account', title: status === 'suspended' ? 'Account suspended' : 'Account reactivated', message: status === 'suspended' ? `Your account was suspended: ${reason}` : 'Your account is active again.', link: '/profile', dedupeKey: `account-${status}:${user._id}:${+user.statusChangedAt}`, mail: t.accountStatus({ name: user.name, status, reason }), essential: true }));
