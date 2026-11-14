"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { ArrowLeft, ImagePlus, LoaderCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { CATEGORIES, formatPrice, listingSchema } from "@/lib/marketplace";

export function ListingForm() {
  const router = useRouter();
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [values, setValues] = useState({ title: "", description: "", price: "", email: "", category: "" });
  useEffect(() => { if (!photo) { setPreview(""); return; } const url = URL.createObjectURL(photo); setPreview(url); return () => URL.revokeObjectURL(url); }, [photo]);
  function chooseFile(event: ChangeEvent<HTMLInputElement>) { setPhoto(event.target.files?.[0] ?? null); setError(""); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const parsed = listingSchema.safeParse(values);
    if (!parsed.success) { setError("Add a title (3+ characters), description (10+ characters), valid price, email, and category."); return; }
    if (!photo) { setError("Please add a photo for your listing."); return; }
    if (photo.size > 5 * 1024 * 1024) { setError("Photo must be 5 MB or smaller."); return; }
    setPending(true);
    try {
      const body = new FormData();
      Object.entries(parsed.data).forEach(([key, value]) => body.set(key, String(value)));
      body.set("photo", photo);
      const response = await fetch("/api/listings", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Your listing could not be saved.");
      router.push(`/marketplace/${result.listing.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your listing could not be saved."); setPending(false); }
  }
  const field = (name: keyof typeof values, value: string) => setValues((current) => ({ ...current, [name]: value }));
  return <main className="form-page"><header className="form-header"><Link className="brand" href="/"><span className="brand-mark">m</span><span>marketday</span></Link><Link className="back-link" href="/"><ArrowLeft size={16}/> Back to browse</Link></header>
    <div className="form-intro"><span className="eyebrow muted">PASS IT ON</span><h1>List something <em>lovely.</em></h1><p>Good things deserve a second chapter. Tell us a little about yours.</p></div>
    <div className="sell-layout"><form className="listing-form" onSubmit={submit} noValidate>
      <section className="form-panel"><div className="panel-title"><span>01</span><div><h2>The details</h2><p>Make it easy for someone to fall in love.</p></div></div>
        <label className="field-label">Title<input value={values.title} onChange={(e) => field("title", e.target.value)} maxLength={120} placeholder="e.g. Vintage rattan lounge chair" required/></label>
        <label className="field-label">Description<textarea value={values.description} onChange={(e) => field("description", e.target.value)} maxLength={3000} rows={5} placeholder="Share the story, condition, or details someone should know…" required/><span className="character-count">{values.description.length}/3,000</span></label>
        <div className="form-two-col"><label className="field-label">Price <span className="price-input"><span>₱</span><input type="number" min="0" step="0.01" value={values.price} onChange={(e) => field("price", e.target.value)} placeholder="0.00" required/></span></label>
          <label className="field-label">Category<select value={values.category} onChange={(e) => field("category", e.target.value)} required><option value="">Choose one</option>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label></div>
      </section>
      <section className="form-panel"><div className="panel-title"><span>02</span><div><h2>A good photo</h2><p>JPEG, PNG, or WebP · up to 5 MB</p></div></div>
        {preview ? <div className="photo-preview"><img src={preview} alt="Listing preview"/><button type="button" className="remove-photo" aria-label="Remove photo" onClick={() => setPhoto(null)}><X size={17}/></button></div> : <label className="upload-zone"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile}/><span className="upload-icon"><ImagePlus size={22}/></span><strong>Drop a photo here, or <u>browse</u></strong><small>Show off the details that make it special.</small></label>}
      </section>
      <section className="form-panel"><div className="panel-title"><span>03</span><div><h2>Where to reach you</h2><p>Buyers can message you about this item.</p></div></div><label className="field-label">Your email<input type="email" value={values.email} onChange={(e) => field("email", e.target.value)} placeholder="you@example.com" required/></label></section>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-primary submit-listing" disabled={pending}>{pending ? <><LoaderCircle className="spin" size={18}/> Publishing your listing…</> : "Publish listing →"}</button>
      <p className="form-terms">By listing, you agree to be kind, honest, and a good neighbor.</p>
    </form>
    <aside className="preview-column"><span className="eyebrow muted">YOUR PREVIEW</span><article className="preview-card"><div className="preview-image">{preview ? <img src={preview} alt=""/> : <div className="preview-placeholder"><ImagePlus size={26}/><span>Your photo will appear here</span></div>}<span className="preview-category">{values.category || "CATEGORY"}</span></div><div className="preview-card-info"><strong>{values.price ? formatPrice(Number(values.price)) : "₱0.00"}</strong><h3>{values.title || "Your lovely item"}</h3><p>{values.description || "A little description helps your next person get to know it."}</p><span>Just listed · Around your neighborhood</span></div></article><div className="seller-tip"><span>✦</span><p><strong>A little tip</strong><br/>Natural light makes the best first impression.</p></div></aside>
    </div>
  </main>;
}
