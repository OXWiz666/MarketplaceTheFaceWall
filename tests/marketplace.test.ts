import { describe, expect, it } from "vitest";
import { filterListings, listingSchema, messageSchema } from "@/lib/marketplace";

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
  ];
  it("filters category and case-insensitive title or description search", () => {
    expect(filterListings(rows, "Home & Furniture", "vintage")).toHaveLength(1);
    expect(filterListings(rows, "All", "BICYCLE")).toHaveLength(1);
    expect(filterListings(rows, "Electronics", "")).toHaveLength(0);
  });
});
