import Link from "next/link";
import { z } from "zod";
import { MarketplaceFrame } from "@/components/marketplace-chrome";
import { CancelCheckout } from "@/components/stripe/checkout-status";
import { OrderSummary } from "@/components/stripe/order-summary";
import { findOrder, publicOrder } from "@/lib/stripe/checkout";

export const metadata = {
  title: "Checkout cancelled | TheFaceWall Marketplace",
  robots: { index: false, follow: false }, referrer: "no-referrer" as const,
};
export const dynamic = "force-dynamic";

export default async function CancelPage({ searchParams }: { searchParams: Promise<{ attempt?: string }> }) {
  const attempt = z.uuid().safeParse((await searchParams).attempt);
  const order = attempt.success ? await findOrder("attempt_id", attempt.data).catch(() => null) : null;
  return <MarketplaceFrame><section className="state-card payment-panel">
    <h1>You left checkout</h1>
    {order && attempt.success ? <>
      <OrderSummary order={publicOrder(order)}/>
      <CancelCheckout attemptId={attempt.data} initialStatus={order.status}/>
    </> : <p>Return to Marketplace to browse listings or start another purchase.</p>}
    <Link className="button new-listing-button" href="/">Back to Marketplace</Link>
  </section></MarketplaceFrame>;
}

