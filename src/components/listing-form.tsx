"use client";

import Image from "next/image";
import { type ChangeEvent, type DragEvent, type FormEvent, useEffect, useState } from "react";
import { ImagePlus, LoaderCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { CATEGORIES, FIELD_LIMITS, formatPrice, IMAGE_TYPES, listingSchema, photoError, priceSchema } from "@/lib/marketplace";
import { MarketplaceFrame } from "@/components/marketplace-chrome";
import { type FieldErrors, useFormErrors } from "@/components/form-errors";

export function ListingForm() {
  const router = useRouter();
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [values, setValues] = useState({ title: "", description: "", price: "", email: "", category: "" });
  const { fieldProps, feedback, setFieldError, showErrors } = useFormErrors("listing");
  const price = priceSchema.safeParse(values.price);

  useEffect(() => {
    if (!photo) { setPreview(""); return; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function selectPhoto(file: File) {
    if (pending) return;
    const error = photoError(file) ?? (file.type && !IMAGE_TYPES.includes(file.type) ? "Choose a JPEG, PNG, or WebP image." : undefined);
    if (!error) setPhoto(file);
    setFieldError("photo", error);
    setError("");
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) selectPhoto(file);
    event.target.value = "";
  }

  function dropFile(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) selectPhoto(file);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    setError("");
    const parsed = listingSchema.safeParse(values);
    const fields: FieldErrors = parsed.success ? {} : parsed.error.flatten().fieldErrors;
    const invalidPhoto = photoError(photo);
    if (invalidPhoto) fields.photo = [invalidPhoto];
    showErrors(form, fields);
    if (!parsed.success || !photo || invalidPhoto) return;
    setPending(true);
    try {
      const body = new FormData();
      Object.entries(parsed.data).forEach(([key, value]) => body.set(key, String(value)));
      body.set("photo", photo);
      const response = await fetch("/api/listings", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) {
        setPending(false);
        if (result.fields) showErrors(form, result.fields);
        else setError(result.error ?? "Your listing could not be saved.");
        return;
      }
      router.push(`/marketplace/${result.listing.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your listing could not be saved.");
      setPending(false);
    }
  }

  function field(name: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setFieldError(name);
  }
  return <MarketplaceFrame><div className="create-page">
    <div className="page-title"><p className="heading-kicker">CREATE NEW LISTING</p><h1>What are you selling?</h1><p>Add clear details and a photo to help your item find a new home.</p></div>
    <div className="sell-layout">
      <form className="listing-form" onSubmit={submit} noValidate>
        <section className="form-panel"><div className="panel-title"><span>01</span><div><h2>The details</h2><p>Make it easy for someone to find your item.</p></div></div>
          <div className="field-label"><label htmlFor="listing-title">Title</label><input {...fieldProps("title", "listing-title-hint")} value={values.title}
            onChange={(event) => field("title", event.target.value)} maxLength={FIELD_LIMITS.title.max} placeholder="For example, vintage rattan chair" required/>
            <span className="field-hint" id="listing-title-hint">3–120 characters</span>{feedback("title")}
          </div>
          <div className="field-label"><label htmlFor="listing-description">Description</label><textarea {...fieldProps("description", "listing-description-hint")}
            value={values.description} onChange={(event) => field("description", event.target.value)} maxLength={FIELD_LIMITS.description.max}
            rows={5} placeholder="Share the condition and details buyers should know." required/>
            <div className="field-meta"><span className="field-hint" id="listing-description-hint">At least 10 characters</span>
              <span className="field-hint">{values.description.length.toLocaleString("en-US")}/3,000</span></div>
            {feedback("description")}
          </div>
          <div className="form-two-col">
            <div className="field-label"><label htmlFor="listing-price">Price in PHP</label>
              <span className="price-input"><span aria-hidden="true">PHP</span><input {...fieldProps("price", "listing-price-hint")}
                inputMode="decimal" maxLength={16} value={values.price} onChange={(event) => field("price", event.target.value)} placeholder="0.00" required/></span>
              <span className="field-hint" id="listing-price-hint">Enter 0 for a free item. Use up to two decimal places.</span>
              {feedback("price")}
            </div>
            <div className="field-label"><label htmlFor="listing-category">Category</label><select {...fieldProps("category")}
              value={values.category} onChange={(event) => field("category", event.target.value)} required><option value="">Choose one</option>
              {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select>{feedback("category")}
            </div>
          </div>
        </section>
        <section className="form-panel"><div className="panel-title"><span>02</span><div><h2>Add a photo</h2><p id="listing-photo-hint">JPEG, PNG, or WebP, up to 5 MB.</p></div></div>
          {preview && <div className="photo-preview"><Image src={preview} alt="Listing preview" fill unoptimized sizes="(max-width: 700px) 100vw, 500px"/>
            <button type="button" className="remove-photo" aria-label="Remove photo" disabled={pending} onClick={() => { setPhoto(null); setFieldError("photo"); }}><X size={17}/></button>
          </div>}
          <label className={preview ? "replace-photo" : "upload-zone"} onDragOver={(event) => event.preventDefault()} onDrop={dropFile}>
            <input {...fieldProps("photo", "listing-photo-hint")} type="file" accept={IMAGE_TYPES.join(",")} disabled={pending} onChange={chooseFile}/>
            {preview ? <strong>Replace photo</strong> : <><span className="upload-icon"><ImagePlus size={22}/></span><strong>Drop a photo here, or <u>browse</u></strong></>}
          </label>
          {feedback("photo")}
        </section>
        <section className="form-panel"><div className="panel-title"><span>03</span><div><h2>Seller information</h2><p>Buyers can contact you about the listing.</p></div></div>
          <div className="field-label"><label htmlFor="listing-email">Your email</label><input {...fieldProps("email")} type="email"
            value={values.email} onChange={(event) => field("email", event.target.value)} placeholder="you@example.com"
            maxLength={FIELD_LIMITS.email} autoComplete="email" required/>{feedback("email")}
          </div>
        </section>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button new-listing-button submit-listing" disabled={pending}>{pending ? <><LoaderCircle className="spin" size={18}/> Publishing listing...</> : "Publish listing"}</button>
        <p className="form-terms">Be accurate and kind when describing an item.</p>
      </form>
      <aside className="preview-column"><div className="results-heading"><h2>Preview</h2><span>Only you can see this</span></div><article className="preview-card"><div className="preview-image">{preview ? <Image src={preview} alt="" fill unoptimized sizes="330px"/> : <div className="preview-placeholder"><ImagePlus size={26}/><span>Your photo will appear here</span></div>}<span className="preview-category">{values.category || "CATEGORY"}</span></div><div className="preview-card-info"><strong>{price.success ? formatPrice(price.data) : "Price preview"}</strong><h3>{values.title || "Your listing title"}</h3><p>{values.description || "Your description will appear here."}</p><span>Just listed</span></div></article><div className="seller-tip"><span>TIP</span><p><strong>Good photos help</strong><br/>Use daylight and show the item clearly.</p></div></aside>
    </div>
  </div></MarketplaceFrame>;
}
