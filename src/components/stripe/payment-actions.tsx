"use client";

import { CreditCard, LoaderCircle } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import type { PaymentAvailability } from "@/lib/marketplace";

const messages = {
  sold: "Sold",
  reserved: "Checkout in progress",
  disabled: "Seller has not enabled payments",
  unavailable: "Online payments are temporarily unavailable",
  "price-unavailable": "Online payment unavailable for this price",
} as const;

export function BuyNow({ listingId, availability }: { listingId: string; availability?: PaymentAvailability }) {
  const reducedMotion = useReducedMotion();
  const attempt = useRef<string | null>(null);
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function buy() {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      attempt.current ??= crypto.randomUUID();
      const response = await fetch("/api/stripe/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, attemptId: attempt.current }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409 && data.error?.includes("has ended")) attempt.current = null;
        throw new Error(data.error ?? "Checkout could not be opened.");
      }
      window.location.assign(data.url);
      return;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Checkout could not be opened.");
      submitting.current = false;
      setPending(false);
    }
  }

  const canResume = availability === "reserved" && attempt.current && (pending || error);
  if (availability !== "available" && !canResume) {
    return <span className={availability === "sold" ? "payment-badge" : "payment-note"}>{messages[availability ?? "disabled"]}</span>;
  }
  return <div className="buy-now">
    <motion.button type="button" className="button new-listing-button" whileTap={reducedMotion ? undefined : { scale: 0.97 }}
      onClick={buy} disabled={pending} aria-busy={pending}>
      {pending ? <LoaderCircle size={16} className="spin"/> : <CreditCard size={16}/>}
      {pending ? "Preparing Checkout…" : canResume ? "Resume checkout" : "Buy Now"}
    </motion.button>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}

