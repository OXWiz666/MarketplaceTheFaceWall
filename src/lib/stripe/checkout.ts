import Stripe from "stripe";
import { appOrigin, feeBasisPoints, paymentCurrency, paymentDatabase, PaymentError, stripeClient } from "./config";
import { getSeller, stripeCanCharge, syncSeller } from "./sellers";

export type Order = {
  id: string;
  listing_id: string;
  seller_account_id: string;
  attempt_id: string;
  amount: number;
  platform_fee: number;
  currency: string;
  product_title: string;
  image_url: string;
  app_origin: string;
  stripe_checkout_session_id: string | null;
  stripe_connected_account_id: string;
  status: "pending" | "paid" | "failed" | "cancelled" | "expired" | "refunded";
  created_at: string;
  expires_at: string;
};

type Outcome = "paid" | "failed" | "cancelled" | "expired";
type EventReference = Pick<Stripe.Event, "id" | "type">;

export async function findOrder(field: "id" | "attempt_id" | "stripe_checkout_session_id" | "stripe_payment_intent_id", value: string) {
  const { data, error } = await paymentDatabase().from("orders").select("*").eq(field, value).maybeSingle<Order>();
  if (error) throw error;
  return data;
}

export function sessionMatches(order: Order, account: string, session: Stripe.Checkout.Session) {
  return account === order.stripe_connected_account_id
    && (!order.stripe_checkout_session_id || session.id === order.stripe_checkout_session_id)
    && session.id.startsWith("cs_test_") && session.livemode === false && session.mode === "payment"
    && session.client_reference_id === order.id && session.metadata?.order_id === order.id
    && session.metadata?.listing_id === order.listing_id && session.amount_total === order.amount
    && session.currency === order.currency;
}

export async function finishOrder(order: Order, outcome: Outcome, session: Stripe.Checkout.Session | null, event?: EventReference) {
  if (session && !sessionMatches(order, order.stripe_connected_account_id, session)) return "ignored";
  if (outcome === "paid" && (session?.payment_status !== "paid" || session.status !== "complete" || !session.payment_intent)) {
    return "ignored";
  }
  if ((outcome === "expired" || outcome === "cancelled") && session && session.status !== "expired") return "ignored";
  if (outcome === "failed" && (session?.status !== "complete" || session.payment_status !== "unpaid")) return "ignored";

  const intent = session?.payment_intent;
  const { data, error } = await paymentDatabase().rpc("finish_marketplace_checkout", {
    p_order: order.id, p_listing: order.listing_id, p_account: order.stripe_connected_account_id,
    p_session: session?.id ?? null, p_amount: order.amount, p_currency: order.currency,
    p_outcome: outcome, p_intent: typeof intent === "string" ? intent : intent?.id ?? null,
    p_email: session?.customer_details?.email ?? null, p_event: event?.id ?? null, p_event_type: event?.type ?? null,
  });
  if (error) throw error;
  return data;
}

export function retrieveSession(order: Order, id: string) {
  return stripeClient().checkout.sessions.retrieve(id, {}, { stripeAccount: order.stripe_connected_account_id });
}

async function recoverStaleOrder(order: Order) {
  const stripe = stripeClient();
  if (order.stripe_checkout_session_id) {
    const session = await retrieveSession(order, order.stripe_checkout_session_id);
    if (session.status === "complete") await finishOrder(order, "paid", session);
    if (session.status === "expired") await finishOrder(order, "expired", session);
    return;
  }

  // A Stripe request could succeed just before this server loses its response.
  // Check Stripe for that order before releasing a reservation with no saved session.
  const created = Math.floor(new Date(order.created_at).getTime() / 1000);
  const expires = Math.floor(new Date(order.expires_at).getTime() / 1000);
  for await (const session of stripe.checkout.sessions.list({
    limit: 100, created: { gte: created - 60, lte: expires },
  }, { stripeAccount: order.stripe_connected_account_id })) {
    if (session.client_reference_id !== order.id) continue;
    if (!sessionMatches(order, order.stripe_connected_account_id, session)) return;
    if (session.status === "complete") await finishOrder(order, "paid", session);
    if (session.status === "expired") await finishOrder(order, "expired", session);
    return;
  }
  await finishOrder(order, "expired", null);
}

async function checkoutUrl(order: Order) {
  const stripe = stripeClient();
  const stripeAccount = order.stripe_connected_account_id;
  if (order.stripe_checkout_session_id) {
    const session = await retrieveSession(order, order.stripe_checkout_session_id);
    if (sessionMatches(order, stripeAccount, session) && session.status === "open" && session.url) return session.url;
    if (session.status === "expired") await finishOrder(order, "expired", session);
    if (session.status === "complete") await finishOrder(order, "paid", session);
    throw new PaymentError("This checkout has ended. Start a new checkout from the listing.", 409);
  }

  const expires = Math.floor(new Date(order.expires_at).getTime() / 1000);
  if (expires - Math.ceil(Date.now() / 1000) <= 30 * 60) {
    throw new PaymentError("This checkout is being recovered. Try again once its reservation ends.", 409);
  }

  const metadata = { order_id: order.id, listing_id: order.listing_id };
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      adaptive_pricing: { enabled: false },
      expires_at: expires,
      client_reference_id: order.id,
      metadata,
      payment_intent_data: {
        metadata,
        ...(order.platform_fee ? { application_fee_amount: order.platform_fee } : {}),
      },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: order.currency, unit_amount: order.amount,
          product_data: { name: order.product_title, ...(order.image_url.startsWith("https://") ? { images: [order.image_url] } : {}) },
        },
      }],
      success_url: `${order.app_origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${order.app_origin}/checkout/cancel?attempt=${order.attempt_id}`,
    }, { stripeAccount, idempotencyKey: `marketplace-checkout-${order.id}` });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeIdempotencyError || (error instanceof Stripe.errors.StripeError && error.code === "idempotency_key_in_use")) {
      throw new PaymentError("Stripe is preparing this checkout. Try again shortly.", 409);
    }
    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      throw new PaymentError("Stripe could not open this checkout for the listing.", 409);
    }
    throw error;
  }
  if (!sessionMatches(order, stripeAccount, session) || !session.url || session.status !== "open") {
    throw new PaymentError("Stripe could not open this checkout.", 502);
  }
  const { data, error } = await paymentDatabase().from("orders")
    .update({ stripe_checkout_session_id: session.id }).eq("id", order.id).eq("status", "pending")
    .is("stripe_checkout_session_id", null).select("id").maybeSingle();
  if (error) throw error;
  if (!data) {
    const saved = await findOrder("id", order.id);
    if (saved?.status !== "pending" || saved.stripe_checkout_session_id !== session.id) {
      throw new PaymentError("This checkout has already ended.", 409);
    }
  }
  return session.url;
}

export async function startCheckout(listingId: string, attemptId: string) {
  const db = paymentDatabase();
  stripeClient();
  const origin = appOrigin();

  const { data: current, error: currentError } = await db.from("orders").select("*")
    .eq("listing_id", listingId).eq("status", "pending").maybeSingle<Order>();
  if (currentError) throw currentError;
  if (current && new Date(current.expires_at).getTime() <= Date.now()) await recoverStaleOrder(current);

  const { data: listing, error: listingError } = await db.from("listings").select("id,status,seller_email_normalized")
    .eq("id", listingId).maybeSingle();
  if (listingError) throw listingError;
  if (!listing) throw new PaymentError("Listing not found.", 404);
  if (listing.status === "sold") throw new PaymentError("This listing has been sold.", 409);
  if (listing.status === "reserved") {
    if (current?.attempt_id === attemptId && new Date(current.expires_at).getTime() > Date.now()) return checkoutUrl(current);
    throw new PaymentError("Another checkout has reserved this listing.", 409);
  }

  const seller = await getSeller("email", listing.seller_email_normalized);
  if (!seller?.stripe_account_id || !stripeCanCharge(await syncSeller(seller.stripe_account_id))) {
    throw new PaymentError("Seller has not enabled payments.", 409);
  }

  const { data, error } = await db.rpc("reserve_marketplace_checkout", {
    p_listing: listingId, p_seller: seller.id, p_account: seller.stripe_account_id, p_attempt: attemptId,
    p_bps: feeBasisPoints(), p_origin: origin,
    p_image_base: db.storage.from("marketplace-images").getPublicUrl("").data.publicUrl,
  });
  if (error) throw error;
  const order = data as Order | null;
  if (!order?.id) throw new PaymentError("This listing is unavailable. Refresh and try again.", 409);
  return checkoutUrl(order);
}

export async function cancelCheckout(order: Order) {
  if (order.status !== "pending") return order.status;
  if (!order.stripe_checkout_session_id) return "pending";

  const stripe = stripeClient();
  const id = order.stripe_checkout_session_id;
  const options = { stripeAccount: order.stripe_connected_account_id };
  let session = await retrieveSession(order, id);
  if (!sessionMatches(order, options.stripeAccount, session)) return "pending";
  if (session.status === "open") {
    try { session = await stripe.checkout.sessions.expire(id, {}, options); }
    catch { session = await retrieveSession(order, id); }
  }
  if (session.status === "expired") await finishOrder(order, "cancelled", session);
  if (session.status === "complete") await finishOrder(order, "paid", session);
  return (await findOrder("id", order.id))?.status ?? "pending";
}

export async function verifyCheckoutReturn(sessionId: string, reconcile: boolean) {
  const order = await findOrder("stripe_checkout_session_id", sessionId);
  if (!order) return null;
  const session = await retrieveSession(order, sessionId);
  if (!sessionMatches(order, order.stripe_connected_account_id, session)) return null;

  let status = order.status;
  if (status === "pending" && reconcile && session.payment_status === "paid") {
    await finishOrder(order, "paid", session);
    status = (await findOrder("id", order.id))?.status ?? status;
  }
  return { ...publicOrder(order), status, stripePaid: session.payment_status === "paid" };
}

export function publicOrder(order: Order) {
  return { id: order.id, title: order.product_title, image: order.image_url, listingId: order.listing_id,
    amount: order.amount, currency: paymentCurrency, status: order.status };
}

