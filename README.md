# Marketday

A responsive community marketplace built for the Test 3 Marketplace hiring challenge. Visitors can publish an item with a photo, browse and filter listings, open a dedicated detail page, and send a message that is saved with the listing.

## Hiring-test requirements

| Requirement | Implementation |
| --- | --- |
| Create Listing | `/marketplace/new` validates listing fields and a photo, checks the image content, uploads to Supabase Storage, saves the row in Postgres, then opens the new detail page. |
| Browse and Filter | `/` and `/marketplace` read paginated listings from Supabase, default to newest first, and support categories, case-insensitive title/description search, and sorting. |
| Listing Detail | `/marketplace/[id]` displays the image, full listing data, seller email contact context, category and date, with a friendly missing-record state. |
| Message Seller | The detail page opens an accessible message dialog; validated messages are inserted in `seller_messages` with the correct listing UUID. The success state appears only after Supabase confirms the insert. |

## Stack

Next.js App Router, React, TypeScript (strict), Tailwind-ready custom CSS, Supabase Postgres and Storage, Zod, Vitest, Testing Library, and ESLint.

## Local setup

1. Install Node.js 20.9 or later and npm.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and fill in the Supabase project URL and service-role key.
4. Apply `supabase/migrations/202611140001_marketplace.sql` in the Supabase SQL Editor or with the Supabase CLI.
5. Run `npm run dev` and open `http://localhost:3000`.

The API returns a clear 503 message until its server-side Supabase configuration is present. It does not substitute mock listings or local storage for database operations. Do not prefix the service-role key with `NEXT_PUBLIC_` or commit it.

## Supabase setup and security

- Create a Supabase project and run the migration.
- Copy the project URL and the `service_role` key from Project Settings  API into `.env.local` / Vercel environment variables.
- The migration creates `listings`, `seller_messages`, indexes, the public image bucket, and enables RLS. Anonymous table permissions are revoked; all reads and writes go through validated server routes using the server-only service key.
- The `marketplace-images` bucket allows public image reads, caps images at 5 MB, and accepts JPEG, PNG, and WebP. Anonymous object uploads and deletes are not permitted. The listing endpoint verifies the actual file signature before uploading and removes an image if the listing insert fails.
- Buyer messages are private: no anonymous table-read policy is created. Messages are never returned by the public API.

## Environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

No email delivery provider is configured. The seller-message success notice confirms database persistence only; it does not claim an email was sent.

## Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
npm start
```

Tests cover shared listing/message validation and marketplace filtering. To prove real persistence, configure Supabase, apply the migration, create a listing and message, then reload the listing and confirm both records in the database. Automated unit tests alone do not prove Supabase connectivity.

## Vercel deployment

Import this repository into Vercel, set the two environment variables above for Production and Preview, apply the migration to the connected Supabase project, then deploy. Dynamic listing pages and API routes use the configured Supabase project. No live deployment has been performed from this repository.

## Known limitations

- No sign-in, seller ownership verification, email notification, or moderation workflow is included, as the challenge does not require them.
- In-memory request throttling is best-effort and resets when a serverless instance restarts. Add a shared rate-limit store before operating this as a high-traffic public marketplace.
- Supabase credentials and a live project are required to verify listing, image, and message persistence end-to-end.

