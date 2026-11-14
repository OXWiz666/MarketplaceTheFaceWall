import { expect, test } from "@playwright/test";

test("seller onboarding opens Stripe without an email link", async ({ page }) => {
  await page.goto("/seller/connect");
  await expect(page.getByRole("heading", { name: "Connect with Stripe" })).toBeVisible();
  await expect(page.getByText("no separate Stripe account is needed", { exact: false })).toBeVisible();

  const email = page.getByLabel("Seller email");
  await expect(email).toBeVisible();
  await email.fill("invalid-email");
  await page.getByRole("button", { name: "Connect with Stripe" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await email.fill("seller@example.com");
  await page.route("**/api/stripe/connect", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ action: "onboard", email: "seller@example.com" });
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ url: "https://connect.stripe.com/setup/fixture" }) });
  });
  await page.route("https://connect.stripe.com/setup/fixture", (route) => route.fulfill({
    status: 200, contentType: "text/html", body: "<h1>Stripe hosted onboarding</h1>",
  }));
  await page.getByRole("button", { name: "Connect with Stripe" }).click();
  await expect(page).toHaveURL("https://connect.stripe.com/setup/fixture");
  await expect(page.getByRole("heading", { name: "Stripe hosted onboarding" })).toBeVisible();
});

test("a webhook without a Stripe signature cannot mark a listing sold", async ({ request }) => {
  const response = await request.post("/api/stripe/webhook", { data: { type: "checkout.session.completed" } });
  expect(response.status()).toBe(400);
  expect(await response.json()).toMatchObject({ error: "Missing Stripe signature." });
});

test("unconnected seller listings cannot be purchased", async ({ page }) => {
  test.skip(!process.env.STRIPE_E2E_UNCONNECTED_LISTING_ID, "Set a real unconnected listing ID for this check.");
  await page.goto(`/marketplace/${process.env.STRIPE_E2E_UNCONNECTED_LISTING_ID}`);
  await expect(page.getByRole("button", { name: "Buy Now" })).toHaveCount(0);
  await expect(page.getByText("Seller has not enabled payments")).toBeVisible();
});

test("an onboarded seller listing opens hosted test Checkout", async ({ page }) => {
  test.skip(!process.env.STRIPE_E2E_LISTING_ID, "Set an active listing ID from a completed sandbox seller onboarding.");
  await page.goto(`/marketplace/${process.env.STRIPE_E2E_LISTING_ID}`);
  await page.getByRole("button", { name: "Buy Now" }).click();
  await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//, { timeout: 20_000 });
  expect(new URL(page.url()).hostname).toBe("checkout.stripe.com");
});
