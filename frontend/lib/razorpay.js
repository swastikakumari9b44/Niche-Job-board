// Loads Razorpay's official Checkout script once, only when a payment is started.
const SRC = "https://checkout.razorpay.com/v1/checkout.js";
let pending;

export function loadCheckout() {
  if (typeof window === "undefined") return Promise.reject(new Error("Checkout can only open in the browser"));
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  pending ||= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Razorpay failed to initialise")));
    s.onerror = () => { pending = null; reject(new Error("Could not load Razorpay Checkout. Check your internet connection or ad blocker.")); };
    document.head.appendChild(s);
  });
  return pending;
}
