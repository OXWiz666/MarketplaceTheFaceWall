"use client";

import { useEffect, useState } from "react";
import { CircleCheck, Clock3 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

async function post(body: object) {
  const response = await fetch("/api/stripe/order", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Order temporarily unavailable.");
  return response.json();
}

export function Confirmation({ sessionId, initialStatus, stripePaid }: { sessionId: string; initialStatus: string; stripePaid: boolean }) {
  const [status, setStatus] = useState(initialStatus);
  const [waiting, setWaiting] = useState(initialStatus === "pending");
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (initialStatus !== "pending") return;
    let stopped = false;
    let timer: number;
    async function check(attempt: number) {
      try {
        const { order } = await post({ action: "confirm", sessionId });
        if (stopped) return;
        setStatus(order.status);
        if (order.status !== "pending") { setWaiting(false); return; }
      } catch { if (stopped) return; }
      if (attempt < 5) timer = window.setTimeout(() => void check(attempt + 1), 2500);
      else setWaiting(false);
    }
    timer = window.setTimeout(() => void check(1), 2000);
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [initialStatus, sessionId]);

  return <motion.div className="payment-confirmation" aria-live="polite" key={status}
    initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
    {status === "paid" ? <>
      <span className="success-icon"><CircleCheck size={26}/></span>
      <h1>Thanks for your purchase!</h1><p>Payment status · Paid</p>
    </> : status === "pending" ? <>
      <span className="success-icon"><Clock3 size={24}/></span>
      <h1>{stripePaid ? "Payment received" : "Checkout pending"}</h1>
      <p>{waiting ? "Confirming your order…" : "Confirmation is still pending. Refresh this page to check again."}</p>
    </> : <><h1>Order status</h1><p className="order-state">{status}</p></>}
  </motion.div>;
}

export function CancelCheckout({ attemptId, initialStatus }: { attemptId: string; initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function cancel() {
    setPending(true);
    setError("");
    try { setStatus((await post({ action: "cancel", attemptId })).status); }
    catch { setError("Checkout could not be closed. Try again or let the reservation expire."); }
    finally { setPending(false); }
  }

  if (status === "paid" || status === "refunded") return <p role="status">Payment status · {status}</p>;
  if (status !== "pending") return <p role="status">Checkout closed. The purchase was not completed.</p>;
  return <div className="buy-now">
    <p>The checkout is still open. Close it to release the listing.</p>
    <button className="button secondary-button" type="button" disabled={pending} onClick={cancel}>{pending ? "Closing checkout…" : "Close checkout"}</button>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}

