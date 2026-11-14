"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Check, LoaderCircle, Mail, X } from "lucide-react";
import { FIELD_LIMITS, formatPrice, messageSchema, type Listing } from "@/lib/marketplace";
import { MarketplaceFrame } from "@/components/marketplace-chrome";
import { BuyNow } from "@/components/stripe/payment-actions";
import { useFormErrors } from "@/components/form-errors";

type Detail = Listing & { image_url: string };

export function ListingDetail({ id }: { id: string }) {
  const [listing, setListing] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    function load() {
      return fetch(`/api/listings/${id}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        return result.listing as Detail;
      })
      .then(setListing)
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : "Listing could not be loaded.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    void load();
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [id]);

  if (loading) return <MarketplaceFrame><section className="detail-main"><div className="detail-skeleton" aria-label="Loading listing"/></section></MarketplaceFrame>;
  if (!listing) return <MarketplaceFrame><section className="detail-main"><Link className="detail-back" href="/"><ArrowLeft size={16}/> Back to Marketplace</Link><div className="state-card empty-state"><span className="empty-icon">?</span><h3>{error || "Listing not found."}</h3><p>It may have been removed, or the link may be incorrect.</p><Link className="button new-listing-button" href="/">Explore Marketplace</Link></div></section></MarketplaceFrame>;

  const date = new Date(listing.created_at).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
  return <MarketplaceFrame><section className="detail-main">
    <Link className="detail-back" href="/"><ArrowLeft size={16}/> Back to Marketplace</Link>
    <div className="detail-layout">
      <div className="detail-image"><Image src={listing.image_url} alt={listing.title} fill unoptimized sizes="(max-width: 700px) 100vw, 60vw"/></div>
      <section className="detail-info">
        <span className="detail-category">{listing.category}</span>
        <h1>{listing.title}</h1>
        <p className="detail-price">{formatPrice(Number(listing.price))}</p>
        <p className="listed-date">Listed {date}</p>
        <div className="detail-description"><h2>Description</h2><p>{listing.description}</p></div>
        <div className="seller-info"><h2>Seller Information</h2><a className="seller-email" href={`mailto:${listing.email}`}><Mail size={15}/>{listing.email}</a>
          <Link className="seller-connect-link" href={`/seller/connect?email=${encodeURIComponent(listing.email)}`}>Connect with Stripe for this listing</Link>
        </div>
        <div className="payment-actions detail-payment-actions">
          <BuyNow listingId={listing.id} availability={listing.payment}/>
          <button className="button secondary-button message-button" onClick={() => setOpen(true)}>Message Seller</button>
        </div>
      </section>
    </div>
    {open && <MessageDialog listing={listing} onClose={() => setOpen(false)}/>}
  </section></MarketplaceFrame>;
}

function MessageDialog({ listing, onClose }: { listing: Detail; onClose: () => void }) {
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const { fieldProps, feedback, setFieldError, showErrors } = useFormErrors("seller-message");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    setError("");
    const parsed = messageSchema.safeParse({ listing_id: listing.id, buyer_name: buyerName, buyer_email: buyerEmail, message });
    if (!parsed.success) {
      const fields = parsed.error.flatten().fieldErrors;
      if (fields.listing_id) setError(fields.listing_id[0]);
      showErrors(form, fields);
      return;
    }
    showErrors(form, {});
    setPending(true);
    try {
      const response = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const result = await response.json();
      if (!response.ok) {
        if (result.fields) {
          showErrors(form, result.fields);
          if (result.fields.listing_id?.[0]) setError(result.fields.listing_id[0]);
        } else setError(result.error ?? "Your message could not be saved.");
        return;
      }
      setSent(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your message could not be saved."); }
    finally { setPending(false); }
  }

  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="message-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <button className="dialog-close" onClick={onClose} aria-label="Close dialog"><X size={19}/></button>
      {sent ? <div className="message-success"><span className="success-icon"><Check size={22}/></span><h2 id="dialog-title">Message saved.</h2><p>Your message has been sent to the seller.</p><small>No email was sent. The seller can review this message in the marketplace.</small><button className="button new-listing-button" onClick={onClose}>Done</button></div> : <>
        <h2 id="dialog-title">Message the seller</h2><p className="dialog-caption">Ask a question about <strong>{listing.title}</strong>.</p>
        <form onSubmit={submit} className="message-form" noValidate>
          <div className="field-label"><label htmlFor="seller-message-buyer_name">Your name</label>
            <input {...fieldProps("buyer_name")} value={buyerName} onChange={(event) => { setBuyerName(event.target.value); setFieldError("buyer_name"); }}
              maxLength={FIELD_LIMITS.name.max} autoComplete="name" required/>{feedback("buyer_name")}
          </div>
          <div className="field-label"><label htmlFor="seller-message-buyer_email">Your email</label>
            <input {...fieldProps("buyer_email")} type="email" value={buyerEmail} onChange={(event) => { setBuyerEmail(event.target.value); setFieldError("buyer_email"); }}
              maxLength={FIELD_LIMITS.email} autoComplete="email" required/>{feedback("buyer_email")}
          </div>
          <div className="field-label"><label htmlFor="seller-message-message">Message</label>
            <textarea {...fieldProps("message", "seller-message-message-hint")} value={message}
              onChange={(event) => { setMessage(event.target.value); setFieldError("message"); }} rows={4}
              maxLength={FIELD_LIMITS.message.max} placeholder="Hi! Is this still available?" required/>
            <span className="field-hint" id="seller-message-message-hint">5–2,000 characters</span>{feedback("message")}
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button new-listing-button" disabled={pending}>{pending ? <><LoaderCircle size={17} className="spin"/> Sending...</> : "Send message"}</button>
          <p className="privacy-note">Your message is stored securely for the seller.</p>
        </form>
      </>}
    </section>
  </div>;
}
