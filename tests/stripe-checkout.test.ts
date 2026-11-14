// @vitest-environment node
import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/stripe/checkout/route";
import { startCheckout, cancelCheckout, verifyCheckoutReturn, type Order } from "@/lib/stripe/checkout";
import { paymentDatabase, stripeClient } from "@/lib/stripe/config";
import { getSeller, syncSeller } from "@/lib/stripe/sellers";

vi.mock("@/lib/stripe/config", async (original) => ({
  ...await original<typeof import("@/lib/stripe/config")>(),
  stripeClient: vi.fn(),
  paymentDatabase: vi.fn(),
}));
vi.mock("@/lib/stripe/sellers", { spy: true });

const listingId = "f7d719f9-8788-435f-a81d-7d0f22bdbad2";
const attemptId = "ab3df020-4356-43d3-bae3-71a76fc3928d";
const account = { id: "acct_seller", details_submitted: true, charges_enabled: true, capabilities: { card_payments: "active" } } as Stripe.Account;
const order: Order = {
  id: "406624b2-de04-44c3-b009-0f736509161c", listing_id: listingId, seller_account_id: "seller",
  attempt_id: attemptId, amount: 12500, platform_fee: 1250, currency: "php", product_title: "Original price",
  image_url: "https://storage.example/image.png", app_origin: "https://market.example",
  stripe_checkout_session_id: null, stripe_connected_account_id: account.id, status: "pending",
  created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 2_400_000).toISOString(),
};
const session = {
  id: "cs_test_session", livemode: false, mode: "payment", amount_total: order.amount, currency: "php",
  metadata: { order_id: order.id, listing_id: listingId }, client_reference_id: order.id,
  url: "https://checkout.stripe.com/c/pay/test", status: "open", payment_status: "unpaid",
};
const create = vi.fn();
const retrieve = vi.fn();
const expire = vi.fn();
const update = vi.fn();
const rpc = vi.fn();

function dbRows({ listingStatus = "active", pending = null as Order | null, saved = null as Order | null } = {}) {
  const query = (table: string) => {
    let lookup = "";
    const chain = {
      select: vi.fn(() => chain), update: vi.fn((changes) => { update(changes); lookup = "update"; return chain; }),
      eq: vi.fn((field) => { if (lookup !== "update") lookup = field; return chain; }),
      is: vi.fn(() => chain), maybeSingle: vi.fn(async () => ({ error: null, data:
        table === "listings" ? { id: listingId, status: listingStatus, seller_email_normalized: "owner@example.com" } :
          lookup === "update" ? { id: order.id } : lookup === "status" ? pending : saved })),
    };
    return chain;
  };
  vi.mocked(paymentDatabase).mockReturnValue({
    from: query, rpc, storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "https://storage.example/" } }) }) },
  } as unknown as ReturnType<typeof paymentDatabase>);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://market.example");
  vi.stubEnv("STRIPE_PLATFORM_FEE_PERCENT", "10");
  vi.mocked(stripeClient).mockReturnValue({ checkout: { sessions: { create, retrieve, expire } } } as unknown as Stripe);
  vi.mocked(getSeller).mockResolvedValue({ id: order.seller_account_id, stripe_account_id: account.id } as Awaited<ReturnType<typeof getSeller>>);
  vi.mocked(syncSeller).mockResolvedValue(account);
  dbRows();
  rpc.mockResolvedValue({ data: order, error: null });
  create.mockResolvedValue(session);
});

describe("checkout and buyer returns", () => {
  it("rejects client-supplied amounts and cross-origin requests before reaching the database", async () => {
    const request = (origin: string, amount?: number) => new Request("https://market.example/api/stripe/checkout", {
      method: "POST", headers: { origin }, body: JSON.stringify({ listingId, attemptId, amount }),
    });
    expect((await POST(request("https://market.example", 1))).status).toBe(400);
    expect((await POST(request("https://elsewhere.example"))).status).toBe(403);
    expect(paymentDatabase).not.toHaveBeenCalled();
  });

  it("charges the database amount with an application fee on the connected account", async () => {
    expect(await startCheckout(listingId, attemptId)).toBe(session.url);
    expect(rpc).toHaveBeenCalledWith("reserve_marketplace_checkout", expect.objectContaining({ p_bps: 1000 }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [expect.objectContaining({ price_data: expect.objectContaining({ unit_amount: 12500, currency: "php" }) })],
      payment_intent_data: expect.objectContaining({ application_fee_amount: 1250 }),
      success_url: "https://market.example/checkout/success?session_id={CHECKOUT_SESSION_ID}",
    }), { stripeAccount: "acct_seller", idempotencyKey: "marketplace-checkout-" + order.id });
    expect(update).toHaveBeenCalledWith({ stripe_checkout_session_id: session.id });
  });

  it("rejects sold listings and missing or disabled seller capabilities", async () => {
    dbRows({ listingStatus: "sold" });
    await expect(startCheckout(listingId, attemptId)).rejects.toMatchObject({ status: 409 });
    dbRows();
    vi.mocked(syncSeller).mockResolvedValue({ ...account, charges_enabled: false });
    await expect(startCheckout(listingId, attemptId)).rejects.toMatchObject({ status: 409 });
    expect(create).not.toHaveBeenCalled();
  });

  it("resumes only the matching attempt", async () => {
    dbRows({ listingStatus: "reserved", pending: { ...order, stripe_checkout_session_id: session.id } });
    retrieve.mockResolvedValue(session);
    expect(await startCheckout(listingId, attemptId)).toBe(session.url);
    await expect(startCheckout(listingId, listingId)).rejects.toMatchObject({ status: 409 });
    expect(create).not.toHaveBeenCalled();
    expect(retrieve).toHaveBeenCalledWith(session.id, {}, { stripeAccount: account.id });
  });

  it("expires the Stripe session before releasing a reservation", async () => {
    const saved = { ...order, stripe_checkout_session_id: session.id };
    dbRows({ saved: { ...saved, status: "cancelled" } });
    retrieve.mockResolvedValue(session);
    expire.mockResolvedValue({ ...session, status: "expired" });
    expect(await cancelCheckout(saved)).toBe("cancelled");
    expect(expire).toHaveBeenCalledWith(session.id, {}, { stripeAccount: account.id });
    expect(rpc).toHaveBeenCalledWith("finish_marketplace_checkout", expect.objectContaining({ p_outcome: "cancelled" }));
  });

  it("keeps an unpaid return pending and uses the same atomic settlement path when Stripe confirms payment", async () => {
    const saved = { ...order, stripe_checkout_session_id: session.id };
    dbRows({ saved });
    retrieve.mockResolvedValueOnce(session).mockResolvedValueOnce({
      ...session, status: "complete", payment_status: "paid", payment_intent: "pi_paid",
      customer_details: { email: "private@example.com" },
    });
    expect(await verifyCheckoutReturn(session.id, true)).toMatchObject({ status: "pending", stripePaid: false });
    expect(rpc).not.toHaveBeenCalled();
    const result = await verifyCheckoutReturn(session.id, true);
    expect(result).toMatchObject({ stripePaid: true });
    expect(JSON.stringify(result)).not.toContain("private@example.com");
    expect(rpc).toHaveBeenCalledWith("finish_marketplace_checkout", expect.objectContaining({ p_outcome: "paid", p_intent: "pi_paid" }));
  });
});

