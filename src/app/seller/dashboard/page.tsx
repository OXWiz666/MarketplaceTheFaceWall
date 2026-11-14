import Link from "next/link";
import { redirect } from "next/navigation";
import { CreditCard } from "lucide-react";
import { MarketplaceFrame } from "@/components/marketplace-chrome";
import { OnboardingButton } from "@/components/stripe/seller-connect";
import { formatPrice } from "@/lib/marketplace";
import { paymentDatabase } from "@/lib/stripe/config";
import { getSeller, refreshSellerStatus, sellerStatus, selectedSellerEmail } from "@/lib/stripe/sellers";

export const metadata = { title: "Seller dashboard | TheFaceWall Marketplace" };

async function dashboard(email: string) {
  const db = paymentDatabase();
  const seller = await refreshSellerStatus(email, true).catch(() => getSeller("email", email));
  const listings = db.from("listings").select("id", { count: "exact", head: true }).eq("seller_email_normalized", email);
  const [total, active, sold, summary, history, items] = await Promise.all([
    listings,
    db.from("listings").select("id", { count: "exact", head: true }).eq("seller_email_normalized", email).eq("status", "active"),
    db.from("listings").select("id", { count: "exact", head: true }).eq("seller_email_normalized", email).eq("status", "sold"),
    seller ? db.rpc("marketplace_seller_totals", { p_seller: seller.id }).maybeSingle<{ sales: number; gross: number; fees: number; proceeds: number }>() : null,
    seller ? db.from("orders").select("id,listing_id,product_title,amount,platform_fee,seller_amount,status,paid_at")
      .eq("seller_account_id", seller.id).in("status", ["paid", "refunded"]).order("paid_at", { ascending: false }).limit(25) : null,
    db.from("listings").select("id,title,status").eq("seller_email_normalized", email).order("created_at", { ascending: false }).limit(10),
  ]);
  const error = total.error ?? active.error ?? sold.error ?? summary?.error ?? history?.error ?? items.error;
  if (error) throw error;
  return { seller, total: total.count, active: active.count, sold: sold.count,
    summary: summary?.data, history: history?.data ?? [], items: items.data ?? [] };
}

export default async function DashboardPage() {
  const email = await selectedSellerEmail();
  if (!email) redirect("/seller/connect");
  const result = await dashboard(email).catch(() => null);
  const seller = result?.seller ?? null;
  return <MarketplaceFrame><section className="state-card payment-panel seller-dashboard">
    <span className="sidebar-icon"><CreditCard size={21}/></span>
    <h1>Seller dashboard</h1><p>{email}</p>
    {!result ? <p role="alert">Seller payments could not be loaded. Refresh and try again.</p> : <>
      <div className="payment-actions">
        <span className="payment-badge">{sellerStatus(seller)}</span>
        <OnboardingButton label={seller?.onboarding_complete ? "Open Stripe dashboard" : seller?.stripe_account_id ? "Resume Stripe setup" : "Continue to Stripe"}/>
      </div>
      {seller?.stripe_account_id && <p>Payouts · {seller.payouts_enabled ? "Enabled" : "Pending"}</p>}
      <dl className="seller-metrics">
        <div><dt>Listings</dt><dd>{result.total}</dd></div>
        <div><dt>Active</dt><dd>{result.active}</dd></div>
        <div><dt>Sold</dt><dd>{result.sold}</dd></div>
        <div><dt>Gross sales</dt><dd>{formatPrice((result.summary?.gross ?? 0) / 100)}</dd></div>
        <div><dt>Platform fees</dt><dd>{formatPrice((result.summary?.fees ?? 0) / 100)}</dd></div>
        <div><dt>Proceeds before Stripe fees</dt><dd>{formatPrice((result.summary?.proceeds ?? 0) / 100)}</dd></div>
      </dl>
      <h2>Sale history</h2>
      {result.history.length ? <div className="payment-table"><table><thead><tr><th>Item</th><th>Status</th><th>Amount</th><th>Platform fee</th><th>Proceeds</th></tr></thead>
        <tbody>{result.history.map((sale) => <tr key={sale.id}><th scope="row"><Link href={`/marketplace/${sale.listing_id}`}>{sale.product_title}</Link></th>
          <td className="order-state">{sale.status}</td><td>{formatPrice(sale.amount / 100)}</td>
          <td>{formatPrice(sale.platform_fee / 100)}</td><td>{formatPrice(sale.seller_amount / 100)}</td></tr>)}</tbody></table></div>
        : <p>No completed sales yet.</p>}
      <h2>Your recent listings</h2>
      {result.items.length ? <ul className="seller-listings">{result.items.map((item) => <li key={item.id}>
        <Link href={`/marketplace/${item.id}`}>{item.title}</Link><span className="order-state">{item.status}</span>
      </li>)}</ul> : <Link className="button secondary-button" href="/marketplace/new">Create your first listing</Link>}
    </>}
  </section></MarketplaceFrame>;
}

