import type Stripe from "stripe";
import { paymentErrorResponse, stripeClient } from "@/lib/stripe/config";
import { processStripeEvent } from "@/lib/stripe/webhooks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing Stripe signature." }, { status: 400 });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret?.startsWith("whsec_")) return Response.json({ error: "Stripe webhook is not configured." }, { status: 503 });

  let stripe: Stripe;
  try { stripe = stripeClient(); }
  catch (error) { return paymentErrorResponse(error, "webhook"); }
  let event: Stripe.Event;
  try {
    const payload = await request.text();
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch { return Response.json({ error: "Invalid Stripe signature or event." }, { status: 400 }); }

  try {
    await processStripeEvent(event);
    return Response.json({ received: true });
  } catch (error) { return paymentErrorResponse(error, "webhook"); }
}

