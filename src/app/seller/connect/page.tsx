import Link from "next/link";
import { CreditCard } from "lucide-react";
import { MarketplaceFrame } from "@/components/marketplace-chrome";
import { OnboardingButton, SellerConnectForm } from "@/components/stripe/seller-connect";
import { sellerEmail, testSecret } from "@/lib/stripe/config";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSeller, selectedSellerEmail } from "@/lib/stripe/sellers";

export const metadata = { title: "Connect with Stripe | TheFaceWall Marketplace" };

export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ email?: string; retry?: string }> }) {
  const params = await searchParams;
  const prefill = sellerEmail.safeParse(params.email);
  const email = await selectedSellerEmail();
  const seller = email ? await getSeller("email", email).catch(() => null) : null;
  const db = getSupabaseServerClient({ privileged: true });
  const schema = testSecret() && db
    ? await db.from("seller_stripe_accounts").select("id", { head: true }).limit(1)
    : null;
  return <MarketplaceFrame><section className="state-card payment-panel">
    <span className="sidebar-icon"><CreditCard size={21}/></span>
    <h1>Connect with Stripe</h1>
    <p>Enable Buy Now on listings using your seller email. Continue directly to Stripe&apos;s hosted sandbox setup; no separate Stripe account is needed.</p>
    {!testSecret() ? <p role="status">Stripe sandbox setup is temporarily unavailable. The Marketplace needs its Stripe test key.</p>
      : !schema || schema.error ? <p role="status">Seller setup is temporarily unavailable. The Marketplace payment database needs to be configured.</p> : email ? <>
      <p role="status" className="payment-badge">Seller selected</p>
      <p>Using <strong>{email}</strong>. Complete Stripe&apos;s sandbox setup to enable Buy Now on your listings.</p>
      <div className="payment-actions">
        <OnboardingButton label={seller?.onboarding_complete ? "Open Stripe dashboard" : params.retry ? "Resume Stripe setup" : "Continue to Stripe"}/>
        <Link className="button secondary-button" href="/seller/dashboard">Seller dashboard</Link>
      </div>
    </> : <SellerConnectForm initialEmail={prefill.success ? prefill.data : undefined}/>}
  </section></MarketplaceFrame>;
}

