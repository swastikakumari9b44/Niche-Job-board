# NicheHire: Product Overview

NicheHire is an academic/portfolio product at the working-prototype stage. This document separates **what exists in the product today** from **ideas and plans**. It contains no customer, revenue, partnership or market-size figures because none exist or were supplied; any such figure would be invented.

## 1. Product vision
Make hiring for specialised roles faster and fairer: employers describe a role in the vocabulary of its field, candidates show their fit in one upload, and an explainable skill-coverage score helps employers decide where to look first. The goal is a focused marketplace per niche (AI/ML, cybersecurity, healthcare and so on) instead of one crowded general board.

## 2. Target users
| User | Need | What NicheHire gives them today |
|---|---|---|
| **Candidates in specialised fields** (students, early-career and experienced) | Find relevant roles; apply simply; know where each application stands | Seven niche categories, job details with niche requirements, PDF-resume apply, status tracking, saved jobs, notifications, personal insights |
| **Employers and small hiring teams** | Describe roles precisely; spot relevant applicants quickly; promote important roles | Niche-specific posting form, applicant table with skill match and status control, analytics and CSV exports, paid featured promotion |
| **Platform administrators** | Keep the marketplace safe and healthy | User suspension, job moderation, audit trail, payment and platform analytics |

## 3. Core value proposition
1. **Niche-aware postings:** one configuration file drives both the validation and the form fields for each category, so postings capture the details that matter in that field.
2. **Faster first review:** each resume is compared with the job's required skills and shown as a percentage with matched and missing skills.
3. **Transparent matching:** the method is deterministic keyword matching with an alias dictionary, so a score can always be explained (it is deliberately not a black-box model, and it is an aid for a human decision).
4. **One workflow for all roles:** application, review, notification, promotion and moderation are connected in one system.
5. **Production-minded engineering:** server-side sessions, CSRF protection, validated uploads, verified payments, graceful failure handling (see `docs/SECURITY_AND_DEPLOYMENT.md`).

## 4. Key differentiators (implemented)
- Vertical/niche category engine with per-category validated fields (7 categories: AI/ML, Frontend Development, Web3 / Blockchain, Nursing / Healthcare, Data Science, Cybersecurity, Other).
- Explainable resume skill-coverage score visible to employers only (candidates do not see it).
- Built-in ATS-style applicant management (Applied / Shortlisted / Rejected) with notifications to candidates.
- Role-specific analytics with date ranges and CSV exports (employer, candidate, admin).
- Admin moderation with a reasoned audit trail; resumes are not accessible to administrators.
- Server-verified payments for featured jobs (signature + gateway fetch + webhook, idempotent).

## 5. Revenue model (as implemented)
- **Free:** registering and posting regular jobs ("Regular listings are free" appears in the employer dashboard) and applying as a candidate.
- **Paid: featured job promotion.** An employer can pay to feature one job. Default: **INR 499 for 7 days** (`FEATURED_PRICE_PAISE=49900`, `FEATURED_DAYS=7`; both changeable by environment variable without code changes). Payment is through Razorpay; the amount is decided only by the server.
- Featured jobs are listed **first** in search results for the paid period; buying again while featured extends the period after the current end date. Flagged or removed jobs get no featured placement.
- The admin Payments page and the platform analytics report revenue only from confirmed (paid) payments; CSV export is available.
- Status: the logic is covered by automated tests with a stubbed gateway. **Live payments have not been tested** and no revenue has been earned.

## 6. Potential monetisation opportunities (ideas, not built)
- Tiered or time-based featured placements (the schema already has `pinnedUntil` and `urgentUntil` promotion fields that no endpoint sets yet, reserved for pinned and "urgent" labels).
- Employer subscription plans (for example a number of active postings or applicant exports per month).
- Paid employer branding (company profile pages).
- Niche-specific partner programmes (training/certification providers) once a niche has an audience.
- Premium candidate tools (profile highlighting, resume feedback).
Each of these would need product design, legal review (payments, invoicing, taxes) and validation with real users before being offered.

## 7. Future roadmap (plans, in suggested order)
1. **Run the end-to-end suite in CI** (`e2e/` already verifies every implemented feature through the real UI but is run by hand) and add component-level frontend tests; add an `<h1>`/accessibility audit of every page.
2. **Verify live integrations:** Razorpay test-mode checkout and webhook, Resend delivery, production cookie behaviour on Vercel + Render.
3. **Application status history** (so candidates and employers can see the timeline) and optional "hired" outcome.
4. **Better matching:** OCR for scanned resumes, wider skill dictionary, optional semantic matching, always keeping the explainable breakdown.
5. **Email verification** of new accounts and notification preferences per event type.
6. **Employer company profiles**, job alerts for candidates, interview scheduling.
7. **Scale and operations:** shared rate-limit store (Redis), monitoring and alerting, automated deployment checks, frontend automated tests.
8. **More niches** by editing the category configuration (no code change for new fields).

## 8. Competitive positioning (qualitative)
| Compared with | NicheHire's position |
|---|---|
| General job boards (broad, high volume) | Narrower and deeper: niche-specific fields and an explainable fit score instead of generic keyword search. Smaller audience by design; a new product has no established user base |
| Full applicant-tracking suites | Much lighter: it combines posting, applicant review and analytics for small teams, but has no interview scheduling, offer management or deep integrations |
| Spreadsheets and email for small teams | Structured workflow, automatic notifications and analytics instead of manual tracking |

Honest limits: a new product with no market traction data; the match is keyword based; live payments and email are not yet validated.
