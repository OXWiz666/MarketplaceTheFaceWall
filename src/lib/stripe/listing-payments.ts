import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { PaymentAvailability } from "@/lib/marketplace";
import { testSecret } from "@/lib/stripe/config";

type PurchasableListing = { id: string; email: string; price: number; status?: string };

export async function listingPayments(listings: PurchasableListing[]) {
  const payments = new Map<string, PaymentAvailability>();
  const db = getSupabaseServerClient({ privileged: true });
  const configured = Boolean(db && testSecret());
  const active = listings.filter(({ status, price }) => status === "active" && price >= 0.5 && price <= 999999.99);
  const reserved = listings.filter(({ status }) => status === "reserved").map(({ id }) => id);
  for (const { id, status, price } of listings) {
    payments.set(id, status === "sold" ? "sold" : status === "reserved" ? "reserved" :
      price < 0.5 || price > 999999.99 ? "price-unavailable" : !configured || !status ? "unavailable" : "disabled");
  }
  if (!db || !configured) return payments;

  if (active.length) {
    const emails = Array.from(new Set(active.map(({ email }) => email.trim().toLowerCase())));
    const { data, error } = await db.from("seller_stripe_accounts").select("email")
      .in("email", emails).eq("onboarding_complete", true).eq("charges_enabled", true).eq("card_payments_active", true);
    const eligible = new Set(data?.map(({ email }) => email));
    for (const listing of active) {
      if (error) payments.set(listing.id, "unavailable");
      else if (eligible.has(listing.email.trim().toLowerCase())) payments.set(listing.id, "available");
    }
  }
  if (reserved.length) {
    const { data } = await db.from("orders").select("listing_id").in("listing_id", reserved)
      .eq("status", "pending").lte("expires_at", new Date().toISOString());
    for (const order of data ?? []) payments.set(order.listing_id, "available");
  }
  return payments;
}

