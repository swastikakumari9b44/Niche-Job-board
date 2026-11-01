# Razorpay featured-job payments: guide for beginners

## What the code does (plain English)
1. Employer clicks **Feature This Job** on the Employer Dashboard.
2. Your **backend** creates a Razorpay *order* (the server decides the price: INR 499, 7 days; the browser can't change it) and saves a `Payment` record.
3. Razorpay **Checkout** (their pop-up) opens in the browser. The employer pays.
4. The browser sends Razorpay's proof to `POST /api/payments/verify`. The backend checks the **signature**, then asks **Razorpay's API** whether the money was really *captured*.
5. Razorpay also calls your **webhook** (`POST /api/payments/webhook`) with a signed message. This is the safety net if the employer closes the tab early.
6. Only when capture is confirmed does the backend set the job to featured for 7 days. The browser can never switch it on.
7. Featured jobs show first in search with a **Featured** badge; it stops automatically after 7 days. Employers see **My Payments**; admins see **Admin > Payments**.

Price/duration are server settings: `FEATURED_PRICE_PAISE` (49900 = INR 499) and `FEATURED_DAYS` (7). No frontend change is needed to change them.

## What YOU must do manually in the Razorpay Dashboard (test mode)
1. Create/sign in to a Razorpay account at https://dashboard.razorpay.com and switch the toggle at the top to **Test Mode**. (No KYC/bank details are needed for test mode.)
2. **Account & Settings > API Keys > Generate Test Key.** You get a **Key ID** (`rzp_test_...`) and a **Key Secret** (shown once: copy it into your own `.env`, never into chat, GitHub or the frontend).
3. **Check payment capture is Automatic:** Settings > Configuration > Payment Capture. If it is manual, payments stay "authorized" and the job is never featured.
4. **Webhooks** (after the tunnel step below): Account & Settings > Webhooks > Add New Webhook.
   - URL: `https://<your-public-url>/api/payments/webhook`
   - Secret: type any long random string yourself (this becomes `RAZORPAY_WEBHOOK_SECRET`; it is different from the key secret).
   - Events: tick **payment.captured**, **payment.failed**, **order.paid**.

## Local setup
```bash
cd backend
npm install                      # installs the official `razorpay` SDK (already listed in package.json)
```
Add to `backend/.env` (names only here; paste your own values):
```
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
# optional: FEATURED_PRICE_PAISE=49900  FEATURED_DAYS=7
```
```bash
npm run dev                      # backend, port 5000
cd ../frontend && npm run dev    # frontend, port 3000
```
The frontend needs **no** Razorpay variable: the backend sends the public Key ID with each order.

## Testing checkout
1. Log in as an employer, post a job, open the **Employer Dashboard**, click **Feature This Job - INR 499.00**.
2. In the Razorpay pop-up use test details. Razorpay's current list is in their docs ("Test Card Details"). Commonly: card `4111 1111 1111 1111`, any future expiry, any CVV, any OTP; UPI `success@razorpay` (success) and `failure@razorpay` (failure). If one is rejected, use the card shown in Razorpay's docs.
3. Success: the job shows **Featured until <date>**, a Featured badge appears on /jobs, and **My Payments** shows **Paid**.
4. Failure/cancel: close the pop-up or use the failure UPI id; the job stays regular and no charge is made.

## Webhooks on your computer (public tunnel)
Razorpay can't reach `localhost`, so expose port 5000 temporarily:
- ngrok: `ngrok http 5000` (copy the `https://....ngrok-free.app` URL), or
- Cloudflare: `cloudflared tunnel --url http://localhost:5000`.
Put `<that-url>/api/payments/webhook` in the Razorpay webhook form. Use a test payment, then watch the backend terminal and Razorpay Dashboard > Webhooks > logs (a `200` means your server accepted it). Close the tunnel when done and delete the webhook URL if it is temporary.

## Checking MongoDB (Atlas > Browse Collections, or mongosh)
- `payments`: `status` goes `created` -> `pending` -> `paid`; look at `razorpayOrderId`, `razorpayPaymentId`, `verifiedAt`, `featuredStartsAt/EndsAt`.
- `jobs`: `isFeatured`, `featuredUntil`, `featuredPaymentId` appear only after `paid`.
- `webhookevents`: one row per processed event (this is what blocks duplicates).

## Testing duplicates, failures and expiry
- **Duplicate webhook:** Razorpay Dashboard > Webhooks > logs > resend a delivery. The response says `"outcome":"duplicate"` and `featuredUntil` does not change.
- **Expiry:** in Atlas set that job's `featuredUntil` to a past date (or mongosh: `db.jobs.updateOne({_id: ObjectId("...")}, {$set: {featuredUntil: new Date(Date.now() - 1000)}})`). Reload /jobs: the badge and top position are gone, and the employer can buy again. Expiry needs no scheduled job.
- **Pay but job closed:** the payment is recorded as `paid` with an `activationNote`; Admin > Payments shows **Needs review**. Refund manually in the Razorpay Dashboard (refunds are not built in).

## Automated tests
```bash
cd backend
npm test                                                       # 37 unit tests, Razorpay mocked, no database
MONGO_URI_TEST="<separate DB with 'test' in its name>" npm test   # + database tests (Razorpay still mocked)
```
They never call Razorpay and never use real keys.

## Deploying (keep TEST MODE until you decide to go live)
**Render (backend) > Environment:** add `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (test values), optionally `FEATURED_PRICE_PAISE`, `FEATURED_DAYS`. Keep your existing `NODE_ENV=production`, `CORS_ORIGIN`, `COOKIE_SAMESITE=none`, `MONGO_URI`, `JWT_SECRET`.
Then in Razorpay (Test Mode) add a **second webhook**: `https://<your-service>.onrender.com/api/payments/webhook` with the production webhook secret you set on Render. Test: Dashboard > Webhooks > send a test payment; expect `200`. (A sleeping free Render instance may answer late; Razorpay retries automatically.)
**Vercel (frontend):** no new variable. Just confirm `NEXT_PUBLIC_API_URL` is your Render URL. Login cookies work as before; Checkout is loaded from Razorpay's own script.
**Go live later:** only after Razorpay approves your account (KYC): generate *Live* keys, replace the three variables, add a live webhook, and run a small real payment yourself first.

## Git
```bash
git checkout -b feature/razorpay-featured-jobs
git add backend frontend PAYMENTS_GUIDE.md
git commit -m "Add Razorpay featured-job payments, payment history and admin payments"
git push -u origin feature/razorpay-featured-jobs      # then open a pull request and merge
```
Never commit `.env`. Render and Vercel redeploy on merge.
