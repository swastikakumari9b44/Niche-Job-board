"use client";
import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { api, errorText } from "@/lib/api";
import { loadCheckout } from "@/lib/razorpay";
import { formatMoney } from "@/lib/format";
import { useToast } from "./ToastProvider";
import { Spinner } from "./ui";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// "Feature This Job" button. The price comes from the server (plan), the order is created by the server, and a job is
// only featured after the SERVER has verified the payment with Razorpay: this component never activates anything itself.
export default function FeatureJobButton({ job, plan, user, onChange }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { tone: "green" | "red" | "amber", text }
  const toast = useToast();
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const say = (tone, text) => {
    if (alive.current) setMsg({ tone, text });
    if (tone === "green") toast.success(text); // final outcomes also appear as a toast
    if (tone === "red") toast.error(text);
  };

  // After checkout the payment may still be "pending" for a few seconds until Razorpay confirms capture.
  async function waitForConfirmation(paymentId) {
    for (let i = 0; i < 8 && alive.current; i++) {
      await sleep(3000);
      const { data } = await api(`/api/payments/${paymentId}`);
      if (data.status === "paid") return say("green", "Payment confirmed. Your job is now featured!");
      if (data.status === "failed") return say("red", "The payment failed. You were not charged for a featured listing.");
    }
    say("amber", "Your payment was received and is waiting for confirmation. It will update automatically; check My Payments in a minute.");
  }

  async function handleSuccess(order, resp) {
    try {
      say("amber", "Verifying your payment...");
      const { data } = await api("/api/payments/verify", {
        method: "POST",
        body: { paymentRecordId: order.paymentRecordId, razorpay_order_id: resp.razorpay_order_id, razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature },
      });
      if (data.status === "paid") say("green", "Payment confirmed. Your job is now featured!");
      else if (data.status === "failed") say("red", "The payment failed.");
      else await waitForConfirmation(order.paymentRecordId);
    } catch (err) {
      say("amber", `We could not confirm the payment yet (${errorText(err)}). If money was deducted it will be confirmed automatically; check My Payments shortly.`);
    } finally {
      onChange?.();
    }
  }

  async function start() {
    if (busy) return; // ignore double clicks
    setBusy(true);
    setMsg(null);
    try {
      const { data: order } = await api("/api/payments/create-order", { method: "POST", body: { jobId: job._id } });
      await loadCheckout();
      await new Promise((resolve) => {
        let finished = false;
        const done = () => { if (!finished) { finished = true; resolve(); } };
        const rzp = new window.Razorpay({
          key: order.keyId, order_id: order.orderId, amount: order.amount, currency: order.currency,
          name: "NicheHire", description: `Feature "${order.jobTitle}" for ${order.days} days`,
          prefill: { name: user?.name, email: user?.email },
          theme: { color: "#4f46e5" },
          handler: (resp) => { finished = true; handleSuccess(order, resp).finally(resolve); },
          modal: { ondismiss: () => { if (!finished) say("amber", "Payment cancelled. You have not been charged."); done(); } },
        });
        rzp.on("payment.failed", (r) => say("red", `Payment failed: ${r?.error?.description || "please try again or use another method"}.`));
        rzp.open();
      });
    } catch (err) {
      say("red", errorText(err));
    } finally {
      if (alive.current) setBusy(false);
      onChange?.();
    }
  }

  return (
    <div className="min-w-44">
      <button onClick={start} disabled={busy || !plan?.enabled} className="btn-primary !bg-amber-500 !px-3 !py-1.5 hover:!bg-amber-600 !text-slate-900" title={plan?.enabled ? undefined : "Payments are not configured yet"}>
        {busy ? <Spinner /> : <Sparkles size={14} aria-hidden="true" />}
        Feature This Job - {formatMoney(plan?.amount ?? 0, plan?.currency)}
      </button>
      {plan?.mode === "test" && <p className="mt-1 text-[11px] text-slate-500">Test mode: no real money is charged.</p>}
      <p aria-live="polite" className={`mt-1 max-w-56 text-xs ${msg?.tone === "green" ? "text-emerald-700" : msg?.tone === "red" ? "text-red-700" : "text-amber-700"}`}>{msg?.text}</p>
    </div>
  );
}
