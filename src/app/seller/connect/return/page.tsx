import Link from "next/link";
import { MarketplaceFrame } from "@/components/marketplace-chrome";
import { OnboardingButton } from "@/components/stripe/seller-connect";
import { refreshSellerStatus, sellerStatus, selectedSellerEmail } from "@/lib/stripe/sellers";

export const metadata = { title: "Stripe setup status | TheFaceWall Marketplace" };

export default async function ConnectReturnPage() {
  const email = await selectedSellerEmail();
  let seller = null;
  let error = false;
  if (email) {
    try {
      seller = await refreshSellerStatus(email);
    } catch { error = true; }
  }
  return <MarketplaceFrame><section className="state-card payment-panel">
    <h1>Stripe setup status</h1>
    {error ? <p role="alert">Stripe status could not be checked. Refresh this page to try again.</p>
      : email ? <p role="status" className="payment-badge">{sellerStatus(seller)}</p>
      : <p>Connect your seller email to view your current Stripe status.</p>}
    {!error && email && (seller?.onboarding_complete
      ? <p>Buy Now is available on your eligible listings.</p>
      : <p>Stripe setup is still pending. Open Stripe to check for any remaining steps.</p>)}
    <div className="payment-actions">
      {email ? <>
        <OnboardingButton label={seller?.onboarding_complete ? "Open Stripe dashboard" : "Resume Stripe setup"}/>
        <Link className="button secondary-button" href="/seller/dashboard">Seller dashboard</Link>
      </> : <Link className="button new-listing-button" href="/seller/connect">Connect with Stripe</Link>}
    </div>
  </section></MarketplaceFrame>;
}

