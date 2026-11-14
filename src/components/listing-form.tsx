"use client";

import Image from "next/image";
import { type ChangeEvent, type DragEvent, type FormEvent, useEffect, useState } from "react";
import { ImagePlus, LoaderCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { CATEGORIES, formatPrice, listingSchema } from "@/lib/marketplace";
import { MarketplaceFrame } from "@/components/marketplace-chrome";

export function ListingForm() {
  const router = useRouter();
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [values, setValues] = useState({ title: "", description: "", price: "", email: "", category: "" });

  useEffect(() => {
    if (!photo) { setPreview(""); return; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    setPhoto(event.target.files?.[0] ?? null);
    setError("");
  }

  function dropFile(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) { setPhoto(file); setError(""); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const parsed = listingSchema.safeParse(values);
    if (!parsed.success) { setError("Check that the title, description, price, email, and category are valid."); return; }
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your listing could not be saved.");
      setPending(false);
    }
  }

  const field = (name: keyof typeof values, value: string) => setValues((current) => ({ ...current, [name]: value }));
  return <MarketplaceFrame><div className="create-page">
    <div className="page-title"><p className="heading-kicker">CREATE NEW LISTING</p><h1>What are you selling?</h1><p>Add clear details and a photo to help your item find a new home.</p></div>
    <div className="sell-layout">
      <form className="listing-form" onSubmit={submit} noValidate>
        <section className="form-panel"><div className="panel-title"><span>01</span><div><h2>The details</h2><p>Make it easy for someone to find your item.</p></div></div>
          <label className="field-label">Title<input value={values.title} onChange={(event) => field("title", event.target.value)} maxLength={120} placeholder="For example, vintage rattan chair" required/></label>
          <label className="field-label">Description<textarea value={values.description} onChange={(event) => field("description", event.target.value)} maxLength={3000} rows={5} placeholder="Share the condition and details buyers should know." required/><span className="character-count">{values.description.length}/3,000</span></label>
          <div className="form-two-col">
            <label className="field-label">Price <span className="price-input"><span>PHP</span><input type="number" min="0" step="0.01" value={values.price} onChange={(event) => field("price", event.target.value)} placeholder="0.00" required/></span></label>
            <label className="field-label">Category<select value={values.category} onChange={(event) => field("category", event.target.value)} required><option value="">Choose one</option>{CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          </div>
        </section>
        <section className="form-panel"><div className="panel-title"><span>02</span><div><h2>Add a photo</h2><p>JPEG, PNG, or WebP, up to 5 MB.</p></div></div>
          {preview ? <div className="photo-preview"><Image src={preview} alt="Listing preview" fill unoptimized sizes="(max-width: 700px) 100vw, 500px"/><button type="button" className="remove-photo" aria-label="Remove photo" onClick={() => setPhoto(null)}><X size={17}/></button></div> : <label className="upload-zone" onDragOver={(event) => event.preventDefault()} onDrop={dropFile}><input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile}/><span className="upload-icon"><ImagePlus size={22}/></span><strong>Drop a photo here, or <u>browse</u></strong><small>Use a clear photo taken in good light.</small></label>}
        </section>
        <section className="form-panel"><div className="panel-title"><span>03</span><div><h2>Seller information</h2><p>Buyers can contact you about the listing.</p></div></div><label className="field-label">Your email<input type="email" value={values.email} onChange={(event) => field("email", event.target.value)} placeholder="you@example.com" autoComplete="email" required/></label></section>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button new-listing-button submit-listing" disabled={pending}>{pending ? <><LoaderCircle className="spin" size={18}/> Publishing listing...</> : "Publish listing"}</button>
        <p className="form-terms">Be accurate and kind when describing an item.</p>
      </form>
      <aside className="preview-column"><div className="results-heading"><h2>Preview</h2><span>Only you can see this</span></div><article className="preview-card"><div className="preview-image">{preview ? <Image src={preview} alt="" fill unoptimized sizes="330px"/> : <div className="preview-placeholder"><ImagePlus size={26}/><span>Your photo will appear here</span></div>}<span className="preview-category">{values.category || "CATEGORY"}</span></div><div className="preview-card-info"><strong>{values.price ? formatPrice(Number(values.price)) : "PHP 0.00"}</strong><h3>{values.title || "Your listing title"}</h3><p>{values.description || "Your description will appear here."}</p><span>Just listed</span></div></article><div className="seller-tip"><span>TIP</span><p><strong>Good photos help</strong><br/>Use daylight and show the item clearly.</p></div></aside>
    </div>
  </div></MarketplaceFrame>;
}

