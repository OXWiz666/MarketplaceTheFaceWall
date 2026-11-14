import Link from "next/link";
import { MarketplaceFrame } from "@/components/marketplace-chrome";
import { Confirmation } from "@/components/stripe/checkout-status";
import { OrderSummary } from "@/components/stripe/order-summary";
import { verifyCheckoutReturn } from "@/lib/stripe/checkout";
import { paymentSessionId } from "@/lib/stripe/config";

export const metadata = {
  title: "Order confirmation | TheFaceWall Marketplace",
  robots: { index: false, follow: false }, referrer: "no-referrer" as const,
};
export const dynamic = "force-dynamic";

export default async function SuccessPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const parsed = paymentSessionId.safeParse((await searchParams).session_id);
  let order = null;
  let error = false;
  if (parsed.success) {
    try { order = await verifyCheckoutReturn(parsed.data, false); }
    catch { error = true; }
  }
  return <MarketplaceFrame><section className="state-card payment-panel">
    {order && parsed.success ? <>
      <Confirmation sessionId={parsed.data} initialStatus={order.status} stripePaid={order.stripePaid}/>
      <OrderSummary order={order}/>
    </> : <>
      <h1>{error ? "Confirmation is temporarily unavailable" : "Order not found"}</h1>
      <p>{error ? "Refresh the page to check your payment status again." : "Open the confirmation link from your Stripe checkout."}</p>
    </>}
    <Link className="button new-listing-button" href="/">Back to Marketplace</Link>
  </section></MarketplaceFrame>;
}

