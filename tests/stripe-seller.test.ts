// @vitest-environment node
import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { POST } from "@/app/api/stripe/connect/route";
import { paymentDatabase, stripeClient } from "@/lib/stripe/config";
import { refreshSellerStatus, sellerStatus, selectedSellerEmail, startSellerOnboarding, type SellerAccount } from "@/lib/stripe/sellers";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/stripe/config", async (original) => ({
  ...await original<typeof import("@/lib/stripe/config")>(),
  stripeClient: vi.fn(),
  paymentDatabase: vi.fn(),
}));
const email = "seller@example.com";
const initial = { id: "seller", email, created_at: new Date().toISOString(), stripe_account_id: null } as SellerAccount;
const account = {
  id: "acct_fixture", details_submitted: false, charges_enabled: false, payouts_enabled: false,
  capabilities: { card_payments: "pending" }, requirements: { currently_due: ["business_type"], past_due: [] },
} as unknown as Stripe.Account;
const create = vi.fn();
const retrieve = vi.fn();
const accountLink = vi.fn();
const rpc = vi.fn();
const getCookie = vi.fn();
const setCookie = vi.fn();
let seller: SellerAccount;
let cookieValue: string | undefined;

function request(body: object) {
  return new Request("https://market.example/api/stripe/connect", {
    method: "POST", headers: { origin: "https://market.example" }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://market.example");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture");
  seller = { ...initial };
  cookieValue = undefined;
  const db = {
    rpc,
    from: (table: string) => {
      let update: Partial<SellerAccount> | undefined;
      const chain = {
        select: () => chain, is: () => chain,
        eq: () => table === "listings" ? Promise.resolve({ count: 1, error: null }) : chain,
        upsert: async () => ({ error: null }),
        update: (changes: Partial<SellerAccount>) => { update = changes; return chain; },
        maybeSingle: async () => {
          if (update) seller = { ...seller, ...update };
          return { data: seller, error: null };
        },
      };
      return chain;
    },
  };
  vi.mocked(paymentDatabase).mockReturnValue(db as unknown as ReturnType<typeof paymentDatabase>);
  vi.mocked(stripeClient).mockReturnValue({ accounts: { create, retrieve, createLoginLink: vi.fn() }, accountLinks: { create: accountLink } } as unknown as Stripe);
  vi.mocked(cookies).mockResolvedValue({ get: getCookie, set: setCookie } as unknown as Awaited<ReturnType<typeof cookies>>);
  getCookie.mockImplementation(() => cookieValue ? { value: cookieValue } : undefined);
  setCookie.mockImplementation((_name, value) => { cookieValue = value; });
  create.mockResolvedValue(account);
  retrieve.mockResolvedValue(account);
  accountLink.mockResolvedValue({ url: "https://connect.stripe.com/setup/fixture" });
  rpc.mockResolvedValue({ error: null });
});

describe("sandbox seller onboarding", () => {
  it("opens hosted Stripe onboarding directly and remembers the selected seller", async () => {
    const result = await POST(request({ action: "onboard", email: "  SELLER@Example.COM " }));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ url: "https://connect.stripe.com/setup/fixture" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ email }), expect.anything());
    expect(setCookie).toHaveBeenCalledWith("marketplace_seller", expect.stringMatching(/^seller%40example\.com\.[a-f0-9]{64}$/),
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: "lax" }));
    expect(await selectedSellerEmail()).toBe(email);
    expect((await POST(request({ action: "onboard" }))).status).toBe(200);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("rejects missing email and tampered cookies", async () => {
    expect((await POST(request({ action: "onboard" }))).status).toBe(400);
    expect((await POST(request({ action: "send", email }))).status).toBe(400);
    cookieValue = "seller%40example.com." + "a".repeat(64);
    expect(await selectedSellerEmail()).toBeNull();
    cookieValue = undefined;
    await POST(request({ action: "onboard", email }));
    expect(await selectedSellerEmail()).toBe(email);
  });

  it("resumes an existing sandbox seller by email in another browser", async () => {
    seller.stripe_account_id = account.id;
    const result = await POST(request({ action: "onboard", email }));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ url: "https://connect.stripe.com/setup/fixture" });
    expect(create).not.toHaveBeenCalled();
    expect(await selectedSellerEmail()).toBe(email);
  });

  it("refreshes a pending seller from Stripe so Buy Now can become available", async () => {
    seller.stripe_account_id = account.id;
    retrieve.mockResolvedValue({ ...account, details_submitted: true, charges_enabled: true, capabilities: { card_payments: "active" } });
    rpc.mockImplementation(async () => {
      seller.onboarding_complete = true;
      return { error: null };
    });
    const updated = await refreshSellerStatus(email, true);
    expect(sellerStatus(updated)).toBe("Payments enabled");
    expect(rpc).toHaveBeenCalledWith("sync_marketplace_seller", expect.objectContaining({ p_details: true, p_charges: true, p_card: true }));
  });

  it("creates, persists, and then reuses the connected account for resumed onboarding", async () => {
    expect(await startSellerOnboarding(email)).toBe("https://connect.stripe.com/setup/fixture");
    expect(seller.stripe_account_id).toBe(account.id);
    expect(await startSellerOnboarding(email)).toBe("https://connect.stripe.com/setup/fixture");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      email, type: "express", capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    }), { idempotencyKey: "marketplace-seller-seller" });
    expect(accountLink).toHaveBeenCalledWith(expect.objectContaining({
      account: account.id, type: "account_onboarding", return_url: "https://market.example/seller/connect/return",
    }));
    expect(rpc).toHaveBeenCalledWith("sync_marketplace_seller", expect.objectContaining({ p_charges: false, p_card: false, p_action: true }));
    expect(sellerStatus({ ...seller, action_required: true })).toBe("Action required");
  });

  it("opens the Express dashboard after setup is complete", async () => {
    seller.stripe_account_id = account.id;
    retrieve.mockResolvedValue({ ...account, details_submitted: true, charges_enabled: true,
      capabilities: { card_payments: "active" }, requirements: { currently_due: [], past_due: [] } });
    const login = vi.mocked(stripeClient().accounts.createLoginLink);
    login.mockResolvedValue({ url: "https://connect.stripe.com/express_login/fixture" } as Awaited<ReturnType<typeof login>>);
    expect(await startSellerOnboarding(email)).toBe("https://connect.stripe.com/express_login/fixture");
    expect(login).toHaveBeenCalledWith(account.id);
    expect(accountLink).not.toHaveBeenCalled();
  });
});

