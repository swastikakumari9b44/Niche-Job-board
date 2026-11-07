// Reusable HTML email templates. Every user-supplied value is HTML-escaped before it is placed in a template.
const { frontendUrl } = require('./email');

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const abs = (path) => `${frontendUrl()}${path.startsWith('/') ? path : `/${path}`}`;

function layout({ preheader, heading, bodyHtml, button, footerNote }) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader || heading)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0">
<tr><td style="background:#4f46e5;padding:18px 28px"><span style="font-size:20px;font-weight:700;color:#ffffff">NicheHire</span></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#0f172a">${esc(heading)}</h1>
<div style="font-size:15px;line-height:1.6;color:#334155">${bodyHtml}</div>
${button ? `<p style="margin:26px 0 6px"><a href="${esc(button.url)}" style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px;display:inline-block">${esc(button.label)}</a></p>
<p style="margin:10px 0 0;font-size:12px;color:#64748b;word-break:break-all">If the button does not work, copy this link into your browser:<br>${esc(button.url)}</p>` : ''}
</td></tr>
<tr><td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">${footerNote || `You are receiving this because you have a NicheHire account. You can change email preferences on your <a href="${esc(abs('/profile'))}" style="color:#4f46e5">profile page</a>.`}</td></tr>
</table></td></tr></table></body></html>`;
}

const p = (html) => `<p style="margin:0 0 12px">${html}</p>`;
const facts = (rows) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;font-size:14px">${rows.map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#64748b">${esc(k)}</td><td style="padding:3px 0;color:#0f172a;font-weight:600">${esc(v)}</td></tr>`).join('')}</table>`;
const money = (paise, cur = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur }).format((paise || 0) / 100);
const date = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const t = {
  welcome: ({ name, role }) => ({
    subject: 'Welcome to NicheHire',
    html: layout({ heading: `Welcome, ${name}!`, bodyHtml: p(role === 'employer' ? 'Your employer account is ready. Post your first job for free and promote it later if you want more visibility.' : 'Your account is ready. Browse niche roles, apply with your resume and track every application in one place.'), button: { label: role === 'employer' ? 'Post a job' : 'Browse jobs', url: abs(role === 'employer' ? '/employer/post' : '/jobs') } }),
    text: `Welcome to NicheHire, ${name}! Get started: ${abs(role === 'employer' ? '/employer/post' : '/jobs')}`,
  }),
  applicationSubmitted: ({ name, job }) => ({
    subject: `Application received: ${job.title}`,
    html: layout({ heading: 'Your application was submitted', bodyHtml: p(`Hi ${esc(name)}, we sent your application to the employer.`) + facts([['Job', job.title], ['Company', job.company]]) + p('We will email you when the employer updates your status.'), button: { label: 'View my applications', url: abs('/candidate/dashboard') } }),
    text: `Hi ${name}, your application for ${job.title} at ${job.company} was submitted. Track it: ${abs('/candidate/dashboard')}`,
  }),
  newApplication: ({ employerName, candidateName, job, matchScore }) => ({
    subject: `New application for ${job.title}`,
    html: layout({ heading: 'You have a new applicant', bodyHtml: p(`Hi ${esc(employerName)}, a candidate applied to one of your jobs.`) + facts([['Candidate', candidateName], ['Job', job.title], ...(matchScore != null ? [['Skill match', `${matchScore}%`]] : [])]), button: { label: 'Review applicants', url: abs('/employer/dashboard') } }),
    text: `New applicant ${candidateName} for ${job.title}. Review: ${abs('/employer/dashboard')}`,
  }),
  statusChanged: ({ name, job, status }) => {
    const line = { Shortlisted: 'Good news! The employer shortlisted your application.', Rejected: 'The employer decided not to move forward with your application this time. Keep going: more roles are waiting.', Applied: 'Your application is back in the "Applied" stage.' }[status] || `Your application status is now ${status}.`;
    return {
      subject: `${status === 'Shortlisted' ? 'You were shortlisted' : 'Application update'}: ${job.title}`,
      html: layout({ heading: `Application ${status.toLowerCase()}`, bodyHtml: p(`Hi ${esc(name)},`) + p(esc(line)) + facts([['Job', job.title], ['Company', job.company], ['Status', status]]), button: { label: 'View my applications', url: abs('/candidate/dashboard') } }),
      text: `Hi ${name}, ${line} (${job.title} at ${job.company}). ${abs('/candidate/dashboard')}`,
    };
  },
  paymentSucceeded: ({ name, job, payment, activated }) => ({
    subject: `Payment received: ${job.title} is ${activated ? 'now featured' : 'paid'}`,
    html: layout({ heading: 'Payment successful', bodyHtml: p(`Hi ${esc(name)}, thank you. ${activated ? 'Your job is now featured in search results.' : 'We received your payment, but the job could not be featured right now. Our team will contact you.'}`) + facts([['Job', job.title], ['Amount', money(payment.amount, payment.currency)], ...(activated && payment.featuredEndsAt ? [['Featured until', date(payment.featuredEndsAt)]] : [])]), button: { label: 'Open dashboard', url: abs('/employer/dashboard') } }),
    text: `Payment of ${money(payment.amount, payment.currency)} received for ${job.title}.${activated ? ' Your job is now featured.' : ''} ${abs('/employer/dashboard')}`,
  }),
  paymentReview: ({ job, payment, employerEmail }) => ({
    subject: 'Action needed: paid featured listing could not be activated',
    html: layout({ heading: 'Payment needs review', bodyHtml: p('A payment was confirmed but the job was closed or removed, so no featured placement was activated. A refund may be needed in the Razorpay dashboard.') + facts([['Job', job.title], ['Employer', employerEmail], ['Amount', money(payment.amount, payment.currency)]]), button: { label: 'Open payments', url: abs('/admin/payments') }, footerNote: 'You receive this because you are a NicheHire administrator.' }),
    text: `Paid listing needs review: ${job.title} (${employerEmail}). ${abs('/admin/payments')}`,
  }),
  jobRemoved: ({ name, job, reason }) => ({
    subject: `Your job "${job.title}" was removed`,
    html: layout({ heading: 'A job listing was removed', bodyHtml: p(`Hi ${esc(name)}, a moderator removed one of your listings because it did not meet our posting rules.`) + facts([['Job', job.title], ['Reason', reason]]) + p('If you believe this was a mistake, please contact support.'), button: { label: 'Open dashboard', url: abs('/employer/dashboard') } }),
    text: `Your job "${job.title}" was removed. Reason: ${reason}.`,
  }),
  accountStatus: ({ name, status, reason }) => ({
    subject: status === 'suspended' ? 'Your NicheHire account was suspended' : 'Your NicheHire account was reactivated',
    html: layout({ heading: status === 'suspended' ? 'Account suspended' : 'Account reactivated', bodyHtml: p(`Hi ${esc(name)},`) + p(status === 'suspended' ? `Your account was suspended by an administrator. Reason: ${esc(reason)}. If you think this is a mistake, please reply to this email or contact support.` : 'Your account is active again. You can sign in as usual.'), footerNote: 'This is an important account notice from NicheHire.' }),
    text: status === 'suspended' ? `Your NicheHire account was suspended. Reason: ${reason}.` : 'Your NicheHire account was reactivated.',
  }),
  passwordReset: ({ name, url, minutes }) => ({
    subject: 'Reset your NicheHire password',
    html: layout({ heading: 'Reset your password', bodyHtml: p(`Hi ${esc(name)}, we received a request to reset your password. This link works once and expires in ${minutes} minutes.`) + p('If you did not ask for this, you can safely ignore this email: your password will not change.'), button: { label: 'Choose a new password', url }, footerNote: 'For your security, never share this link with anyone.' }),
    text: `Reset your NicheHire password (valid ${minutes} minutes, one use): ${url}\nIf you did not request this, ignore this email.`,
  }),
  passwordChanged: ({ name }) => ({
    subject: 'Your NicheHire password was changed',
    html: layout({ heading: 'Password changed', bodyHtml: p(`Hi ${esc(name)}, your password was just changed and all other sessions were signed out.`) + p('If this was not you, reset your password immediately and contact support.'), button: { label: 'Reset password', url: abs('/forgot-password') }, footerNote: 'This is a security notice from NicheHire.' }),
    text: `Your NicheHire password was changed. If this was not you, reset it now: ${abs('/forgot-password')}`,
  }),
};

module.exports = { templates: t, esc, abs };
