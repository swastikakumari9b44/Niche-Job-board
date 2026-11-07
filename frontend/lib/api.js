export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

const LOCAL = /^(localhost|127\.0\.0\.1)$/;

// Local development: if the page is opened as http://127.0.0.1:3000 but the API URL says localhost (or the reverse),
// the browser treats them as different sites and drops the login cookie. So the API host follows the page's host.
export function apiBase() {
  if (typeof window === "undefined") return API_URL;
  try {
    const u = new URL(API_URL);
    if (LOCAL.test(u.hostname) && LOCAL.test(window.location.hostname)) u.hostname = window.location.hostname;
    return u.origin;
  } catch {
    return API_URL;
  }
}

export class ApiError extends Error {
  constructor(message, status, errors, code) {
    super(message);
    this.status = status;
    this.errors = errors || [];
    this.code = code; // e.g. ACCOUNT_SUSPENDED
  }
}

// Reusable API client. Auth uses the HttpOnly cookie, so every request sends credentials; no token is ever stored in JS.
export async function api(path, { method = "GET", body, form } = {}) {
  let res;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method,
      credentials: "include",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    console.error(`NicheHire: cannot reach the API at ${apiBase()}. Is the backend running and NEXT_PUBLIC_API_URL correct?`); // for developers only
    throw new ApiError("We can't reach NicheHire right now. Please check your internet connection and try again.", 0);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.success === false) {
    throw new ApiError(json?.message || `Request failed (${res.status})`, res.status, json?.errors, json?.code);
  }
  return json;
}

// Authenticated PDF download (the uploads folder is never public). Opens the PDF in a new tab.
export async function openResume(applicationId) {
  const res = await fetch(`${apiBase()}/api/applications/${applicationId}/resume`, { credentials: "include" });
  if (!res.ok) throw new ApiError("Could not load the resume", res.status);
  const url = URL.createObjectURL(await res.blob());
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Downloads a CSV report with the signed-in session (the cookie is sent; the file is never publicly reachable).
export async function downloadCsv(path, fallbackName = "report.csv") {
  let res;
  try {
    res = await fetch(`${apiBase()}${path}`, { credentials: "include" });
  } catch {
    throw new ApiError("We can't reach NicheHire right now. Please check your internet connection and try again.", 0);
  }
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new ApiError(json?.message || "We could not create the report. Please try again.", res.status, json?.errors, json?.code);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return { truncated: res.headers.get("X-Export-Truncated") === "true" };
}

// Turns an ApiError into a readable string, including field messages from validation errors.
// User-facing text for a failed request. Server errors (500) never show technical wording; 4xx messages from the API are
// written for users (validation, permissions) and are shown as they are.
export function errorText(err, fallback = "Something went wrong on our side. Please try again in a moment.") {
  if (!err) return "";
  if (err.status === 500 || err.status === undefined) return fallback;
  if (err.status === 429) return "Too many attempts. Please wait a few minutes and try again.";
  const details = (err.errors || []).map((e) => (e.field ? `${e.field}: ${e.message}` : e.message));
  return details.length ? `${err.message}. ${details.join("; ")}` : err.message;
}
