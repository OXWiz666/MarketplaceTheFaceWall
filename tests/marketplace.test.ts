import { describe, expect, it } from "vitest";
import { filterListings, listingSchema, messageSchema, normalizeSearch, priceSchema, sellerEmail } from "@/lib/marketplace";

const validListing = { title: "Vintage chair", description: "A comfortable chair in lovely condition.", price: "250.50", email: "seller@example.com", category: "Home & Furniture" };

describe("listing validation", () => {
  it("accepts valid listing details and converts its price", () => {
    const parsed = listingSchema.parse(validListing);
    expect(parsed.price).toBe(250.5);
  });
  it("rejects negative prices, malformed email, and unsupported category", () => {
    expect(listingSchema.safeParse({ ...validListing, price: "-1" }).success).toBe(false);
    expect(listingSchema.safeParse({ ...validListing, email: "seller-at-example" }).success).toBe(false);
    expect(listingSchema.safeParse({ ...validListing, category: "Unlisted" }).success).toBe(false);
  });

  it("returns the specific description error shown for a seven-character listing description", () => {
    const result = listingSchema.safeParse({ ...validListing, description: " Test123 " });
    expect(result.error?.flatten().fieldErrors).toEqual({ description: ["Use at least 10 characters."] });
  });

  it("requires an explicit price and accepts free, decimal, and grouped PHP amounts", () => {
    expect(priceSchema.parse("0")).toBe(0);
    expect(priceSchema.parse("2,500.50")).toBe(2500.5);
    for (const invalid of ["", "  ", "2.555", "2,50", "1e3", "0x10", null, "10000000000"]) {
      expect(priceSchema.safeParse(invalid).success).toBe(false);
    }
  });
});

describe("seller and search validation", () => {
  it("normalizes seller email", () => {
    expect(sellerEmail.parse("  Seller@Example.COM ")).toBe("seller@example.com");
  });

  it("trims, collapses spaces, and limits Marketplace search text", () => {
    expect(normalizeSearch("  Honda   Civic  ")).toBe("Honda Civic");
    expect(normalizeSearch("a".repeat(121))).toHaveLength(120);
  });
});

describe("message validation", () => {
  it("requires buyer identity, valid email, listing ID, and a meaningful message", () => {
    const good = { listing_id: "1586da54-d6ce-4b18-8eed-d6f03a8fe18e", buyer_name: "Taylor Doe", buyer_email: "buyer@example.com", message: "Is this still available?" };
    expect(messageSchema.safeParse(good).success).toBe(true);
    expect(messageSchema.safeParse({ ...good, message: "Hi" }).success).toBe(false);
  });
});

describe("marketplace filters", () => {
  const rows = [
    { title: "Vintage Chair", description: "Oak and cane", category: "Home & Furniture" },
    { title: "Road bike", description: "Lightweight city bicycle", category: "Sports & Outdoors" },
  ] as const;
  it("filters category and case-insensitive title or description search", () => {
    expect(filterListings(rows, "Home & Furniture", "vintage")).toHaveLength(1);
    expect(filterListings(rows, "All", "BICYCLE")).toHaveLength(1);
    expect(filterListings(rows, "Electronics", "")).toHaveLength(0);
  });
});
