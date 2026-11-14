// @vitest-environment node
import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/stripe/webhook/route";
import { feeBasisPoints } from "@/lib/stripe/config";
import { processStripeEvent } from "@/lib/stripe/webhooks";
import { findOrder, finishOrder, type Order } from "@/lib/stripe/checkout";
import { getSeller, syncSeller } from "@/lib/stripe/sellers";

vi.mock("@/lib/stripe/checkout", { spy: true });
vi.mock("@/lib/stripe/sellers", { spy: true });

const stripe = new Stripe("sk_test_fixture");
const secret = "whsec_fixture";
const order: Order = {
  id: "48d1f23d-e414-4d7b-8819-019ec923d0ff", listing_id: "2b6910b9-b36b-4773-8541-814cc69de3e5",
  seller_account_id: "seller", attempt_id: "attempt", amount: 15000, platform_fee: 1500, currency: "php",
  product_title: "Item", image_url: "", app_origin: "", stripe_checkout_session_id: "cs_test_fixture",
  stripe_connected_account_id: "acct_ours", status: "pending", created_at: "", expires_at: "",
};
const session = {
  id: "cs_test_fixture", mode: "payment", livemode: false, amount_total: 15000, currency: "php",
  status: "complete", payment_intent: "pi_fixture", payment_status: "paid", client_reference_id: order.id,
  metadata: { order_id: order.id, listing_id: order.listing_id },
};
const event = { id: "evt_fixture", type: "checkout.session.completed", account: "acct_ours", livemode: false, data: { object: session } };

function request(payload = JSON.stringify(event), signature?: string) {
  return new Request("https://market.example/api/stripe/webhook", {
    method: "POST", body: payload, headers: signature ? { "stripe-signature": signature } : undefined,
  });
}

function sign(payload: string) { return stripe.webhooks.generateTestHeaderString({ payload, secret }); }

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
  vi.mocked(findOrder).mockResolvedValue(order);
  vi.mocked(finishOrder).mockResolvedValue("paid");
  vi.mocked(syncSeller).mockResolvedValue({} as Stripe.Account);
});

describe("Stripe Connect webhook", () => {
  it("rejects missing signatures and a modified body", async () => {
    expect((await POST(request())).status).toBe(400);
    const payload = JSON.stringify(event);
    expect((await POST(request(payload + " ", sign(payload)))).status).toBe(400);
    expect(findOrder).not.toHaveBeenCalled();
  });

  it("accepts SDK-signed payloads and dispatches the expected order", async () => {
    const payload = JSON.stringify(event);
    expect((await POST(request(payload, sign(payload)))).status).toBe(200);
    expect(finishOrder).toHaveBeenCalledWith(order, "paid", session, expect.objectContaining({ id: event.id }));
  });

  it("ignores live mode, other accounts, sessions, listing metadata, currency and amount", async () => {
    for (const update of [
      { livemode: true }, { account: "acct_other" },
      { data: { object: { ...session, id: "cs_test_other" } } },
      { data: { object: { ...session, currency: "usd" } } },
      { data: { object: { ...session, amount_total: 14999 } } },
      { data: { object: { ...session, metadata: { ...session.metadata, listing_id: "other" } } } },
    ]) {
      const payload = JSON.stringify({ ...event, ...update });
      expect((await POST(request(payload, sign(payload)))).status).toBe(200);
    }
    expect(finishOrder).not.toHaveBeenCalled();
  });

  it("syncs known account changes and ignores other accounts", async () => {
    vi.mocked(getSeller).mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "seller" } as Awaited<ReturnType<typeof getSeller>>);
    const update = { ...event, type: "account.updated", data: { object: { id: event.account } } } as Stripe.Event;
    await processStripeEvent(update);
    expect(syncSeller).not.toHaveBeenCalled();
    await processStripeEvent(update);
    expect(syncSeller).toHaveBeenCalledWith(event.account, event.id);
  });

  it("returns an error Stripe can retry when persistence fails", async () => {
    vi.mocked(finishOrder).mockRejectedValueOnce({ code: "DB_TEMPORARY" });
    const payload = JSON.stringify(event);
    expect((await POST(request(payload, sign(payload)))).status).toBe(502);
    expect((await POST(request(payload, sign(payload)))).status).toBe(200);
  });
});

describe("Stripe fee configuration", () => {
  it("uses integer basis points and rejects invalid configuration", () => {
    vi.stubEnv("STRIPE_PLATFORM_FEE_PERCENT", undefined);
    expect(feeBasisPoints()).toBe(1000);
    expect(feeBasisPoints("12.35")).toBe(1235);
    expect(feeBasisPoints("0")).toBe(0);
    expect(() => feeBasisPoints("101")).toThrow();
    expect(() => feeBasisPoints("0.001")).toThrow();
  });
});

