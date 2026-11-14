import type Stripe from "stripe";
import { z } from "zod";
import { findOrder, finishOrder, sessionMatches } from "./checkout";
import { paymentDatabase, stripeClient } from "./config";
import { getSeller, syncSeller } from "./sellers";

export async function processStripeEvent(event: Stripe.Event) {
  if (event.livemode || !event.account) return;
  const account = event.account;

  switch (event.type) {
    case "account.updated":
      if (event.data.object.id === account && await getSeller("stripe_account_id", account)) await syncSeller(account, event.id);
      return;
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const session = event.data.object;
      const id = z.uuid().safeParse(session.metadata?.order_id);
      if (!id.success) return;
      const order = await findOrder("id", id.data);
      if (!order || order.status !== "pending" || !sessionMatches(order, account, session)) return;
      const outcome = event.type === "checkout.session.expired" ? "expired"
        : event.type === "checkout.session.async_payment_failed" ? "failed" : "paid";
      await finishOrder(order, outcome, session, event);
      return;
    }
    case "charge.refunded": {
      const charge = event.data.object;
      const intent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (!intent || charge.livemode || !charge.refunded || charge.amount_refunded !== charge.amount) return;
      let order = await findOrder("stripe_payment_intent_id", intent);
      if (!order) {
        // A refund delivery can race ahead of Checkout's completion delivery.
        if (!await getSeller("stripe_account_id", account)) return;
        const payment = await stripeClient().paymentIntents.retrieve(intent, {}, { stripeAccount: account });
        const id = z.uuid().safeParse(payment.metadata.order_id);
        if (!id.success) return;
        order = await findOrder("id", id.data);
      }
      if (!order || order.stripe_connected_account_id !== account || order.amount !== charge.amount ||
          order.currency !== charge.currency || order.status === "refunded") return;
      if (order.status === "pending") throw new Error("Refund arrived before checkout completion");
      const { error } = await paymentDatabase().rpc("refund_marketplace_order", {
        p_order: order.id, p_account: account, p_intent: intent, p_amount: charge.amount,
        p_currency: charge.currency, p_event: event.id,
      });
      if (error) throw error;
    }
  }
}

