import Stripe from "stripe";
import { z } from "zod";
import { isRateLimited } from "@/lib/rate-limit";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export class PaymentError extends Error {
  constructor(message: string, readonly status: number, readonly fields?: Record<string, string[] | undefined>) { super(message); }
}

export const paymentCurrency = "php";
export const paymentSessionId = z.string().regex(/^cs_test_[A-Za-z0-9_]+$/).max(255);
export { sellerEmail } from "@/lib/marketplace";

let stripe: Stripe | undefined;

export function testSecret() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key && /^(?:sk|rk)_test_[A-Za-z0-9_]+$/.test(key) ? key : undefined;
}

export function stripeClient() {
  const key = testSecret();
  if (!key) throw new PaymentError("Stripe sandbox payments are unavailable.", 503);
  stripe ??= new Stripe(key, { maxNetworkRetries: 1, timeout: 10_000 });
  return stripe;
}

export function paymentDatabase() {
  const db = getSupabaseServerClient({ privileged: true });
  if (!db) throw new PaymentError("The payment database is unavailable.", 503);
  return db;
}

export function appOrigin() {
  const value = process.env.NEXT_PUBLIC_APP_URL?.trim();
  let url: URL;
  try { url = new URL(value ?? ""); }
  catch { throw new PaymentError("The payment return URL is unavailable.", 503); }
  const local = (url.hostname === "localhost" || url.hostname === "127.0.0.1") && !process.env.VERCEL;
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new PaymentError("The payment return URL is unavailable.", 503);
  }
  return url.origin;
}

export function feeBasisPoints(value = process.env.STRIPE_PLATFORM_FEE_PERCENT ?? "10") {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(value.trim());
  const points = match ? Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0")) : NaN;
  if (!Number.isInteger(points) || points > 10000) {
    throw new PaymentError("The payment fee is unavailable.", 503);
  }
  return points;
}

export function verifyBrowserRequest(request: Request, action: string, limit = 12) {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== appOrigin())) {
    throw new PaymentError("This request must come from Marketplace.", 403);
  }
  const ip = (request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local").trim();
  if (isRateLimited(`payments:${action}:${ip}`, limit)) {
    throw new PaymentError("Too many attempts. Please wait a minute.", 429);
  }
}

export async function readPaymentRequest<T>(request: Request, schema: z.ZodType<T>) {
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 4096) throw new Error("Request too large");
    body = JSON.parse(raw);
  } catch { throw new PaymentError("Check your request and try again.", 400); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new PaymentError("Check your request and try again.", 400, parsed.error.flatten().fieldErrors);
  return parsed.data;
}

export function paymentErrorResponse(error: unknown, action: string) {
  if (error instanceof PaymentError) return Response.json({ error: error.message, fields: error.fields }, { status: error.status });
  // Stripe and PostgREST errors may include private data in their messages.
  const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
  console.error(`[payments:${action}]`, { code });
  return Response.json({ error: "Payments are temporarily unavailable. Please try again." }, { status: 502 });
}

