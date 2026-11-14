import { readFileSync } from "node:fs";
import { parseArgs, parseEnv } from "node:util";
import Stripe from "stripe";

const local = {};
for (const file of [".env", ".env.local"]) {
  try { Object.assign(local, parseEnv(readFileSync(file, "utf8"))); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}
const env = { ...local, ...process.env };
const key = env.STRIPE_SECRET_KEY?.trim();
if (!key || !/^(?:sk|rk)_test_[A-Za-z0-9_]+$/.test(key)) {
  throw new Error("Set STRIPE_SECRET_KEY to a sandbox key.");
}
const { values } = parseArgs({ options: { origin: { type: "string" } } });
const origin = URL.parse(values.origin ?? env.NEXT_PUBLIC_APP_URL ?? "");
if (!origin || origin.protocol !== "https:" || origin.pathname !== "/" || origin.username || origin.password || origin.search || origin.hash ||
    origin.hostname === "localhost" || origin.hostname === "127.0.0.1" || origin.hostname === "[::1]") {
  throw new Error("NEXT_PUBLIC_APP_URL must be the public HTTPS production origin.");
}

const url = new URL("/api/stripe/webhook", origin).href;
const events = [
  "account.updated",
  "checkout.session.completed",
  "checkout.session.expired",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "charge.refunded",
];
const stripe = new Stripe(key, { maxNetworkRetries: 2 });
const description = "TheFaceWall Marketplace connected accounts";
try {
  // The deployed handler rejects unsigned POSTs before checking its secret.
  // A 404, login page, or redirect means Stripe cannot deliver events here yet.
  const probe = await fetch(url, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(10_000),
  });
  const response = probe.status === 400 ? await probe.json().catch(() => null) : null;
  if (response?.error !== "Missing Stripe signature.") {
    throw new Error(`Webhook route unavailable at ${url} (HTTP ${probe.status}). Deploy the route to the public Vercel production URL and retry.`);
  }
  let existing;
  for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 })) {
    if (endpoint.url === url) { existing = endpoint; break; }
  }
  if (existing) {
    console.log(`An endpoint already exists for ${url} (${existing.id}).`);
    console.log("Check the Connect scope and event list in Stripe, then obtain the signing secret from that endpoint.");
  } else {
    const endpoint = await stripe.webhookEndpoints.create({
      url, connect: true, enabled_events: events, description,
    }, { idempotencyKey: `marketplace-webhook-${origin.origin}` });
    console.log(`Created Connect endpoint ${endpoint.id} for ${url}.`);
    console.log("Save this value as STRIPE_WEBHOOK_SECRET in Vercel Production and redeploy. Keep it out of logs and Git.");
    console.log(endpoint.secret);
  }
} catch (error) {
  console.error("Could not register the Stripe Connect webhook.", error.code ?? error.type ?? error.message);
  process.exitCode = 1;
}

