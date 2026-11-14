"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Check, LoaderCircle, Mail, X } from "lucide-react";
import { formatPrice, messageSchema, type Listing } from "@/lib/marketplace";
import { MarketplaceFrame } from "@/components/marketplace-chrome";

type Detail = Listing & { image_url: string };

export function ListingDetail({ id }: { id: string }) {
  const [listing, setListing] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/listings/${id}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        return result.listing as Detail;
      })
      .then(setListing)
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : "Listing could not be loaded.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
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
        <div className="seller-info"><h2>Seller Information</h2><a className="seller-email" href={`mailto:${listing.email}`}><Mail size={15}/>{listing.email}</a></div>
        <button className="button new-listing-button message-button" onClick={() => setOpen(true)}>Message Seller</button>
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const parsed = messageSchema.safeParse({ listing_id: listing.id, buyer_name: buyerName, buyer_email: buyerEmail, message });
    if (!parsed.success) { setError("Enter your name, a valid email, and a message of at least 5 characters."); return; }
    setPending(true);
    try {
      const response = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Your message could not be saved.");
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
          <label className="field-label">Your name<input value={buyerName} onChange={(event) => setBuyerName(event.target.value)} maxLength={100} autoComplete="name" required/></label>
          <label className="field-label">Your email<input type="email" value={buyerEmail} onChange={(event) => setBuyerEmail(event.target.value)} maxLength={254} autoComplete="email" required/></label>
          <label className="field-label">Message<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} maxLength={2000} placeholder="Hi! Is this still available?" required/></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button new-listing-button" disabled={pending}>{pending ? <><LoaderCircle size={17} className="spin"/> Sending...</> : "Send message"}</button>
          <p className="privacy-note">Your message is stored securely for the seller.</p>
        </form>
      </>}
    </section>
  </div>;
}

