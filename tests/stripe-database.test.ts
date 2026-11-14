// @vitest-environment node
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite({ extensions: { pgcrypto } });
const seller = randomUUID();
const account = "acct_marketplace";
const origin = "https://market.example";
const imageBase = "https://storage.example/";
const email = "seller@example.com";
let paymentMigration: string;

async function listing(price = "100.05") {
  const { rows } = await db.query<{ id: string }>(
    "insert into listings (title,description,price,email,category,image_path) values ('Test listing','Complete description',$1,' Seller@Example.com ','Electronics','item.png') returning id",
    [price],
  );
  return rows[0].id;
}

async function reserve(id: string, attempt = randomUUID(), bps = 1000) {
  const { rows } = await db.query<{ result: { id: string; amount: number; platform_fee: number; seller_amount: number; image_url: string } | null }>(
    "select reserve_marketplace_checkout($1,$2,$3,$4,$5,$6,$7) result", [id, seller, account, attempt, bps, origin, imageBase],
  );
  return rows[0].result ?? { id: null };
}

async function settle(order: string, id: string, options: { session?: string; outcome?: string; amount?: number; currency?: string; account?: string; event?: string; intent?: string } = {}) {
  const { rows } = await db.query<{ result: string }>(
    "select finish_marketplace_checkout($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) result",
    [order, id, options.account ?? account, options.session ?? "cs_test_1", options.amount ?? 10005,
      options.currency ?? "php", options.outcome ?? "paid", options.intent ?? "pi_unique",
      "buyer@example.com", options.event ?? randomUUID(), "checkout.session.completed"],
  );
  return rows[0].result;
}

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit integer, allowed_mime_types text[]);
    create table storage.objects (bucket_id text, name text);
    alter table storage.objects enable row level security;`);
  for (const file of ["202611140001_marketplace.sql", "202611140002_allow_public_marketplace.sql"]) {
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  }
  await listing();
  paymentMigration = await readFile("supabase/migrations/20261114115759_stripe_connect.sql", "utf8");
  // The SQL Editor may have run the schema statements in a separate attempt.
  const firstFunction = paymentMigration.indexOf("create or replace function");
  await db.exec(paymentMigration.slice(0, firstFunction));
  await db.exec(paymentMigration);
  await db.query("insert into seller_stripe_accounts (id,email,stripe_account_id) values ($1,$2,$3)", [seller, email, account]);
}, 20_000);

afterAll(async () => db.close());

describe("Stripe migration and Postgres transactions", () => {
  it("backfills existing listing ownership and keeps anonymous listing and messaging grants", async () => {
    const { rows } = await db.query("select status,seller_email_normalized,sold_at from listings");
    expect(rows).toEqual([{ status: "active", seller_email_normalized: email, sold_at: null }]);
    const inserted = await db.query(
      "select has_column_privilege('anon','listings','title','insert') title, has_column_privilege('anon','listings','sold_at','insert') sold, has_table_privilege('anon','seller_messages','insert') message",
    );
    expect(inserted.rows).toEqual([{ title: true, sold: false, message: true }]);
  });

  it("keeps all payment records and mutation RPCs private", async () => {
    for (const role of ["anon", "authenticated"]) {
      const { rows } = await db.query(
        "select has_table_privilege($1,'orders','select') orders, has_table_privilege($1,'seller_stripe_accounts','select') seller, has_table_privilege($1,'stripe_webhook_events','insert') webhook, has_function_privilege($1,'reserve_marketplace_checkout(uuid,uuid,text,uuid,integer,text,text)','execute') reserve",
        [role],
      );
      expect(rows[0]).toEqual({ orders: false, seller: false, webhook: false, reserve: false });
    }
  });

  it("can be rerun without deleting existing listings or connected sellers", async () => {
    await db.exec(paymentMigration);
    expect((await db.query("select count(*)::int as count from listings")).rows).toEqual([{ count: 1 }]);
    expect((await db.query("select stripe_account_id from seller_stripe_accounts where id = $1", [seller])).rows)
      .toEqual([{ stripe_account_id: account }]);
  });

  it("requires Stripe capability and ignores out-of-order seller status writes", async () => {
    const id = await listing();
    expect((await reserve(id)).id).toBeNull();
    await db.query("select sync_marketplace_seller($1,'2026-11-14T00:00:01Z',true,true,true,true,false,null,'evt_ready')", [account]);
    await db.query("select sync_marketplace_seller($1,'2026-11-14T00:00:00Z',false,false,false,false,true,'disabled','evt_stale')", [account]);
    const { rows } = await db.query("select onboarding_complete,charges_enabled,card_payments_active from seller_stripe_accounts");
    expect(rows[0]).toEqual({ onboarding_complete: true, charges_enabled: true, card_payments_active: true });
    expect((await reserve(id)).id).toBeTruthy();
  });

  it("reserves only once, reuses the same attempt, and calculates half-up fee from database price", async () => {
    const id = await listing();
    const attempt = randomUUID();
    const [first, second] = await Promise.all([reserve(id, attempt), reserve(id)]);
    expect(first).toMatchObject({ amount: 10005, platform_fee: 1001, seller_amount: 9004, image_url: imageBase + "item.png" });
    expect(second.id).toBeNull();
    expect((await reserve(id, attempt, 9900)).id).toBe(first.id);
    expect((await db.query("select status from listings where id=$1", [id])).rows).toEqual([{ status: "reserved" }]);
  });

  it("ignores mismatched events, commits paid and sold together, and does not sell twice", async () => {
    const id = await listing();
    const order = (await reserve(id)).id!;
    await db.query("update orders set stripe_checkout_session_id = 'cs_test_1' where id = $1", [order]);
    for (const mismatch of [{ amount: 10004 }, { account: "acct_other" }, { currency: "usd" }, { session: "cs_test_other" }]) {
      expect(await settle(order, id, mismatch)).toBe("ignored");
    }
    expect((await db.query("select status from orders where id=$1", [order])).rows).toEqual([{ status: "pending" }]);
    expect(await settle(order, id, { event: "evt_paid" })).toBe("paid");
    expect(await settle(order, id, { event: "evt_paid" })).toBe("ignored");
    expect(await settle(order, id, { outcome: "expired" })).toBe("ignored");
    expect((await reserve(id)).id).toBeNull();
    expect((await db.query("select status, sold_at is not null timestamped from listings where id=$1", [id])).rows)
      .toEqual([{ status: "sold", timestamped: true }]);
    expect((await db.query("select count(*)::int count from stripe_webhook_events where id='evt_paid'")).rows).toEqual([{ count: 1 }]);
  });

  it("releases only the matching expired reservation and ignores late events after a new attempt", async () => {
    const id = await listing();
    const old = (await reserve(id)).id!;
    expect(await settle(old, id, { outcome: "cancelled", session: "cs_test_expired" })).toBe("cancelled");
    const next = (await reserve(id)).id!;
    expect(next).not.toBe(old);
    expect(await settle(old, id, { session: "cs_test_expired" })).toBe("ignored");
    expect((await db.query("select status from orders where id=$1", [next])).rows).toEqual([{ status: "pending" }]);
  });

  it("rolls back event deduplication when the order write fails and accepts the same event on retry", async () => {
    const id = await listing();
    const order = (await reserve(id)).id!;
    const options = { event: "evt_retry", session: "cs_test_race" };
    await expect(settle(order, id, options)).rejects.toMatchObject({ code: "23505" });
    expect((await db.query("select id from stripe_webhook_events where id='evt_retry'")).rows).toEqual([]);
    expect(await settle(order, id, { ...options, intent: "pi_second" })).toBe("paid");
    await db.query("select refund_marketplace_order($1,$2,'pi_second',10005,'php','evt_refund')", [order, account]);
    expect((await db.query("select status from orders where id=$1", [order])).rows).toEqual([{ status: "refunded" }]);
    expect((await db.query("select status from listings where id=$1", [id])).rows).toEqual([{ status: "sold" }]);
  });
});

