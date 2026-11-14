# TheFaceWall Marketplace

A community marketplace for TheFaceWall hiring challenge. Visitors can publish a listing with a photo, browse and filter items, message a seller, and buy eligible listings through Stripe Checkout in sandbox mode.

## Setup

1. Use Node.js 22 or newer and run `npm ci`.
2. Copy `.env.example` to `.env.local`. Add the Supabase project URL, publishable key, and server-only service-role key. The legacy Supabase anon key also works for public browsing.
3. Apply the SQL files in `supabase/migrations/` in filename order. If the Test 3 schema is already installed, apply only the new Stripe migration. Existing listings keep their data and use their normalized seller email to match Stripe accounts.
4. Add the hiring challenge's Stripe test secret. Set `NEXT_PUBLIC_APP_URL` to the exact origin where the app runs. Use the public HTTPS origin for hosted Stripe onboarding and production webhook registration.
5. Run `npm run dev` and open the configured origin.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public project key for Marketplace operations |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only database access for payments and private seller data |
| `STRIPE_SECRET_KEY` | Server-only Stripe sandbox API key beginning with `sk_test_` or `rk_test_` |
| `STRIPE_WEBHOOK_SECRET` | Server-only signing secret for the Connect endpoint |
| `STRIPE_PLATFORM_FEE_PERCENT` | Defaults to 10 and supports up to two decimal places |
| `NEXT_PUBLIC_APP_URL` | Marketplace origin used for Stripe return URLs |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Optional with hosted Checkout. The browser redirects to Stripe using the server-issued URL. |

Keep credentials in `.env.local` and Vercel Production environment variables. The app rejects live Stripe keys and events.

### Seller onboarding

This hiring challenge is sandbox-only and requires no login. A seller enters the email used on a listing and selects **Connect with Stripe**. The server creates or resumes an Express connected account and sends the browser directly to Stripe's hosted onboarding. The email selects matching listings; it is not email verification or identity proof. The browser receives an HTTP-only signed cookie for returning to the local seller dashboard. A seller can select the same email in another browser. Do not use this email-only model for live payments; add real seller authentication before accepting live keys. The localhost origin in `.env.local` is for local testing only and must not be the production `NEXT_PUBLIC_APP_URL`.

### Running the Stripe migration in the Supabase SQL Editor

Open a new query, paste the entire `20261114115759_stripe_connect.sql` file, and run it with no text selected. The migration enables RLS for its payment tables directly. If the editor offers to append RLS statements, run the file as pasted. The migration can be rerun after a partial application.

## Payment flow

1. Sellers open **Connect with Stripe**, enter the email used on their listing, and complete the hosted sandbox onboarding. The seller dashboard shows **Payments enabled** once Stripe confirms the account can take card payments. Once setup is complete, **Open Stripe dashboard** creates an Express dashboard login link.
2. Stripe hosts onboarding for new Express connected accounts created with the platform's sandbox key. Sellers do not need an existing Stripe account. The app checks the connected account's status on return and on `account.updated`. Existing listings become eligible when card payments are active and details have been submitted.
3. **Buy Now** reserves the item in Postgres and opens a hosted card Checkout Session on the connected account. Postgres converts the listing's PHP price to centavos and rounds the fee half-up. A ₱100.00 listing yields a ₱10.00 application fee and ₱90.00 in seller proceeds before Stripe processing fees.
4. A signed Connect event verifies the session, account, listing, amount, and currency before atomically marking an order **Paid** and the listing **Sold**. The success screen polls the order and can reconcile a delayed webhook against Stripe's connected-account session.
5. Checkout reserves an item for up to 40 minutes. Closing Checkout from the cancellation page expires the matching Stripe session before releasing the item. Abandoned sessions release via an expiry event or a later checkout's Stripe-backed recovery check. Fully refunded items stay sold and appear as refunded in seller history.

The Supabase payment tables and mutation functions are service-role only. Public listing APIs return availability without Stripe account IDs or private order information. Declined cards can be retried through the same Stripe Checkout while it remains open. Checkout currently accepts cards and preserves the existing PHP listing currency. Stripe may impose a higher minimum charge based on the connected account’s settlement currency.

## Deploy and register the webhook

1. Configure the Supabase project and set the environment variables on the Marketplace Vercel project. Deploy from the intended production branch.
2. With the Stripe sandbox key in `.env.local`, register the endpoint using your public Vercel production origin. The script checks that the deployed handler answers an unsigned POST with HTTP 400 before creating the Connect endpoint.

   ```sh
   node --env-file=.env.local scripts/create-webhook.mjs --origin https://marketplacethefacewall.vercel.app
   ```

   Omit `--origin` when `NEXT_PUBLIC_APP_URL` already points to the public deployment. The flag lets local development keep its localhost origin. The endpoint subscribes to `checkout.session.completed`, `account.updated`, and the events the app uses for expired sessions, asynchronous Checkout outcomes, and full refunds. If an endpoint already exists for that URL, verify its Connect scope and subscriptions in Stripe.
3. Copy the generated signing secret to `STRIPE_WEBHOOK_SECRET` in `.env.local` and Vercel Production, then redeploy. Keep the registration output private. A local Stripe CLI listener uses its own signing secret.
4. Verify the production deployment with the sandbox walkthrough below. For a usable reviewer demo, create two test listings under the same onboarded seller so one remains available after your purchase test.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

The tests exercise the actual SQL migrations in embedded PostgreSQL, signed webhook fixtures with the Stripe SDK, direct seller onboarding, checkout request validation, and the existing Marketplace validation and filters.

Playwright browser checks are in `e2e/stripe.spec.mjs`. Install `@playwright/test` as a dev dependency and run `npx playwright install chromium`, then `npx playwright test`. Set `STRIPE_E2E_BASE_URL` to the public deployment origin when checking Vercel. Set `STRIPE_E2E_UNCONNECTED_LISTING_ID` and `STRIPE_E2E_LISTING_ID` to exercise real listing availability and the redirect to Stripe Checkout. The latter must be an active listing from a seller who completed sandbox onboarding; opening Checkout reserves it temporarily. Card entry and paid webhook delivery require a manual sandbox purchase and an installed webhook endpoint.

For the full sandbox walkthrough, create a listing with a photo and confirm it appears after refresh, through category and keyword filters, and on its detail page. Send a test seller message and confirm the row in Supabase. Complete Stripe-hosted onboarding and confirm the existing listing gains Buy Now. Buy it with `4242 4242 4242 4242`, a future expiry, any three-digit CVC, and a test email. Check the charge and application fee in Stripe sandbox, the paid Supabase order, the webhook delivery, and the Sold badge after refreshing. On a second test item, cancel and close Checkout, then verify the item is available again. Test two simultaneous buyers on a third listing and verify only one Stripe Checkout opens.

See [reviewer notes](docs/stripe-reviewer.md) for the submission walkthrough. The demo listing, sandbox evidence screenshots, and deployed URL should be verified against the final deployment before submitting.
