"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, LoaderCircle, Mail, ShieldCheck, X } from "lucide-react";
import { formatPrice, messageSchema, type Listing } from "@/lib/marketplace";

type Detail = Listing & { image_url: string };

export function ListingDetail({ id }: { id: string }) {
  const [listing, setListing] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/listings/${id}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result.listing as Detail; })
      .then(setListing).catch((cause: unknown) => { if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : "Listing could not be loaded."); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [id]);
  if (loading) return <main className="detail-page"><div className="detail-skeleton" aria-label="Loading listing"/></main>;
  if (!listing) return <main className="detail-page"><Link className="back-link" href="/"><ArrowLeft size={16}/> Back to browse</Link><div className="state-card empty-state"><span className="empty-icon">✳</span><h1>{error || "Listing not found."}</h1><p>It may have been removed, or the link may be incorrect.</p><Link className="button button-primary" href="/">Explore the marketplace</Link></div></main>;
  const date = new Date(listing.created_at).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
  return <main className="detail-page"><header className="form-header"><Link className="brand" href="/"><span className="brand-mark">m</span><span>marketday</span></Link><Link className="back-link" href="/"><ArrowLeft size={16}/> Back to browse</Link></header>
    <div className="breadcrumbs"><Link href="/">Marketplace</Link><span>/</span><Link href="/marketplace">{listing.category}</Link><span>/</span><span>{listing.title}</span></div>
    <div className="detail-layout"><div className="detail-image"><img src={listing.image_url} alt={listing.title}/><span className="detail-image-label">A GOOD FIND, FOUND NEARBY</span></div>
      <section className="detail-info"><span className="eyebrow muted">{listing.category.toUpperCase()}</span><h1>{listing.title}</h1><p className="detail-price">{formatPrice(Number(listing.price))}</p><p className="listed-date">Listed {date}</p><div className="detail-description"><h2>The story</h2><p>{listing.description}</p></div>
        <div className="seller-card"><div className="seller-avatar">{listing.email[0]?.toUpperCase()}</div><div className="seller-meta"><span>YOUR NEIGHBOR</span><strong>Seller</strong><a href={`mailto:${listing.email}`}><Mail size={13}/>{listing.email}</a><small><ShieldCheck size={14}/> Email shared for this listing</small></div></div>
        <button className="button button-primary message-button" onClick={() => setOpen(true)}><Mail size={17}/> Message Seller <ArrowUpRight size={16}/></button><p className="detail-reassurance">✦ Be respectful and keep conversations on Marketday.</p>
      </section>
    </div>
    {open && <MessageDialog listing={listing} onClose={() => setOpen(false)}/>}
  </main>;
}

function MessageDialog({ listing, onClose }: { listing: Detail; onClose: () => void }) {
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const parsed = messageSchema.safeParse({ listing_id: listing.id, buyer_name: buyerName, buyer_email: buyerEmail, message });
    if (!parsed.success) { setError("Please enter your name, a valid email, and a message of at least 5 characters."); return; }
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
    <section className="message-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><button className="dialog-close" onClick={onClose} aria-label="Close dialog"><X size={19}/></button>
      {sent ? <div className="message-success"><span className="success-icon"><Check size={22}/></span><h2 id="dialog-title">Message saved.</h2><p>Your message has been sent to the seller.</p><small>We haven’t sent an email notification; the seller can review messages in the marketplace database.</small><button className="button button-primary" onClick={onClose}>Done</button></div> : <><span className="eyebrow muted">START A CONVERSATION</span><h2 id="dialog-title">Message the seller</h2><p className="dialog-caption">Ask a question about <strong>{listing.title}</strong>.</p>
        <form onSubmit={submit} className="message-form" noValidate><label className="field-label">Your name<input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} maxLength={100} autoComplete="name" required/></label><label className="field-label">Your email<input type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} maxLength={254} autoComplete="email" required/></label><label className="field-label">Message<textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={2000} placeholder="Hi! Is this still available?" required/></label>
          {error && <p className="form-error" role="alert">{error}</p>}<button className="button button-primary" disabled={pending}>{pending ? <><LoaderCircle size={17} className="spin"/> Sending…</> : "Send message →"}</button><p className="privacy-note">Your message is stored securely for the seller.</p></form></>}
    </section>
  </div>;
}
