import Stripe from "stripe";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { appOrigin, paymentDatabase, PaymentError, sellerEmail, stripeClient, testSecret } from "./config";

const sellerCookie = "marketplace_seller";
export type SellerAccount = {
  id: string;
  email: string;
  stripe_account_id: string | null;
  onboarding_complete: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  card_payments_active: boolean;
  action_required: boolean;
  disabled_reason: string | null;
  created_at: string;
};

function sessionSignature(email: string) {
  const secret = testSecret();
  if (!secret) throw new PaymentError("Stripe sandbox setup is unavailable.", 503);
  return createHmac("sha256", secret).update(`marketplace-seller:${email}`).digest("hex");
}

export async function rememberSeller(email: string) {
  const value = `${encodeURIComponent(email)}.${sessionSignature(email)}`;
  (await cookies()).set(sellerCookie, value, {
    httpOnly: true, secure: appOrigin().startsWith("https:"), sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
}

export async function selectedSellerEmail() {
  const token = (await cookies()).get(sellerCookie)?.value;
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  let decoded: string;
  try { decoded = decodeURIComponent(token.slice(0, dot)); } catch { return null; }
  const email = sellerEmail.safeParse(decoded);
  if (!email.success || email.data !== decoded) return null;
  const signature = token.slice(dot + 1);
  if (!/^[a-f0-9]{64}$/.test(signature)) return null;
  const received = Buffer.from(signature, "hex");
  const expected = Buffer.from(sessionSignature(email.data), "hex");
  return timingSafeEqual(received, expected) ? email.data : null;
}

export async function getSeller(field: "email" | "stripe_account_id", value: string) {
  const { data, error } = await paymentDatabase().from("seller_stripe_accounts").select("*").eq(field, value).maybeSingle<SellerAccount>();
  if (error) throw error;
  return data;
}

export async function syncSeller(accountId: string, eventId: string | null = null): Promise<Stripe.Account> {
  const checkedAt = new Date().toISOString();
  const account = await stripeClient().accounts.retrieve(accountId);
  const { error } = await paymentDatabase().rpc("sync_marketplace_seller", {
    p_account: accountId, p_checked_at: checkedAt, p_details: account.details_submitted ?? false,
    p_charges: account.charges_enabled ?? false, p_payouts: account.payouts_enabled ?? false,
    p_card: account.capabilities?.card_payments === "active",
    p_action: Boolean(account.requirements?.currently_due?.length || account.requirements?.past_due?.length),
    p_disabled: account.requirements?.disabled_reason ?? null, p_event: eventId,
  });
  if (error) throw error;
  return account;
}

export async function refreshSellerStatus(email: string, pendingOnly = false) {
  const seller = await getSeller("email", email);
  if (!seller?.stripe_account_id || (pendingOnly && seller.onboarding_complete)) return seller;
  await syncSeller(seller.stripe_account_id);
  return getSeller("email", email);
}

export function stripeCanCharge(account: Stripe.Account) {
  return Boolean(account.details_submitted && account.charges_enabled && account.capabilities?.card_payments === "active");
}

export function sellerStatus(seller: SellerAccount | null) {
  if (!seller?.stripe_account_id) return "Not connected";
  if (seller.onboarding_complete) return "Payments enabled";
  if (seller.details_submitted && seller.disabled_reason && seller.disabled_reason !== "requirements.pending_verification") return "Restricted";
  if (seller.action_required) return "Action required";
  if (seller.details_submitted) return "Connected";
  return "Onboarding pending";
}

export async function startSellerOnboarding(email: string) {
  const db = paymentDatabase();
  const stripe = stripeClient();
  const origin = appOrigin();
  const { count, error: listingError } = await db.from("listings")
    .select("id", { count: "exact", head: true }).eq("seller_email_normalized", email);
  if (listingError) throw listingError;
  if (!count) throw new PaymentError("Create a listing with this email before connecting Stripe.", 409);

  const { error: claimError } = await db.from("seller_stripe_accounts").upsert({ email }, { onConflict: "email", ignoreDuplicates: true });
  if (claimError) throw claimError;
  const seller = await getSeller("email", email);
  if (!seller) throw new PaymentError("Could not open the seller account. Please try again.", 502);

  let accountId = seller.stripe_account_id;
  if (!accountId) {
    // Stripe keys can be pruned after 24 hours. Never silently create another
    // account if the original request may have succeeded without being saved.
    if (Date.now() - new Date(seller.created_at).getTime() >= 23 * 60 * 60 * 1000) {
      throw new PaymentError("This Stripe setup needs support to resume.", 409);
    }
    try {
      const account = await stripe.accounts.create({
        type: "express", email, capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        metadata: { marketplace_seller_id: seller.id },
      }, { idempotencyKey: `marketplace-seller-${seller.id}` });
      accountId = account.id;
    } catch (error) {
      if (error instanceof Stripe.errors.StripeIdempotencyError) {
        throw new PaymentError("Stripe is already preparing this account. Try again shortly.", 409);
      }
      throw error;
    }
    const { data, error } = await db.from("seller_stripe_accounts")
      .update({ stripe_account_id: accountId }).eq("id", seller.id).is("stripe_account_id", null)
      .select("stripe_account_id").maybeSingle();
    if (error) throw error;
    if (!data && (await getSeller("email", email))?.stripe_account_id !== accountId) {
      throw new PaymentError("Could not save the Stripe account.", 409);
    }
  }

  const account = await syncSeller(accountId);
  if (stripeCanCharge(account) && !account.requirements?.currently_due?.length && !account.requirements?.past_due?.length) {
    const login = await stripe.accounts.createLoginLink(accountId);
    return login.url;
  }
  const link = await stripe.accountLinks.create({
    account: accountId, type: "account_onboarding",
    refresh_url: `${origin}/seller/connect/refresh`,
    return_url: `${origin}/seller/connect/return`,
  });
  return link.url;
}

