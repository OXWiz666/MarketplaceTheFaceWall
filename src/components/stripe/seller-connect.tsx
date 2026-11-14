"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { FIELD_LIMITS, sellerEmail } from "@/lib/marketplace";
import { type FieldErrors, useFormErrors } from "@/components/form-errors";

class ConnectError extends Error {
  constructor(message: string, readonly fields?: FieldErrors) { super(message); }
}

async function connect(body: object): Promise<{ url: string }> {
  const response = await fetch("/api/stripe/connect", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new ConnectError(data.error ?? "Stripe setup is temporarily unavailable.", data.fields);
  return data;
}

export function OnboardingButton({ label }: { label: string }) {
  const reducedMotion = useReducedMotion();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function open() {
    setPending(true);
    setError("");
    try { window.location.assign((await connect({ action: "onboard" })).url); }
    catch (error) {
      setError(error instanceof Error ? error.message : "Stripe setup is temporarily unavailable.");
      setPending(false);
    }
  }
  return <div className="buy-now">
    <motion.button type="button" className="button new-listing-button" disabled={pending} onClick={open}
      whileTap={reducedMotion ? undefined : { scale: 0.97 }}>
      {label} {pending ? <LoaderCircle size={16} className="spin"/> : <ArrowRight size={16}/>}
    </motion.button>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}

export function SellerConnectForm({ initialEmail = "" }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const { fieldProps, feedback, setFieldError, showErrors } = useFormErrors("seller-connect");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    setError("");
    const parsedEmail = sellerEmail.safeParse(email);
    if (!parsedEmail.success) {
      showErrors(form, { email: parsedEmail.error.issues.map(({ message }) => message) });
      return;
    }
    showErrors(form, {});
    setPending(true);
    try {
      window.location.assign((await connect({ action: "onboard", email: parsedEmail.data })).url);
    } catch (error) {
      if (error instanceof ConnectError && error.fields?.email) showErrors(form, error.fields);
      else setError(error instanceof Error ? error.message : "Stripe setup is temporarily unavailable.");
      setPending(false);
    }
  }

  return <form className="message-form payment-form" onSubmit={submit} noValidate>
    <div className="field-label"><label htmlFor="seller-connect-email">Seller email</label>
      <input {...fieldProps("email", "seller-connect-email-hint")} type="email" autoComplete="email" maxLength={FIELD_LIMITS.email}
        value={email} onChange={(event) => { setEmail(event.target.value); setFieldError("email"); }} readOnly={pending} required/>
      <span id="seller-connect-email-hint" className="field-hint">Use the email on your Marketplace listing. Sandbox only.</span>{feedback("email")}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="payment-actions">
      <button className="button new-listing-button" disabled={pending}>
        {pending ? <><LoaderCircle size={16} className="spin"/> Opening Stripe...</> : "Connect with Stripe"}
      </button>
    </div>
  </form>;
}
