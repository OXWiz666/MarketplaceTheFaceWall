import { z } from "zod";

export const CATEGORIES = [
  "Electronics", "Vehicles", "Home & Furniture", "Fashion",
  "Sports & Outdoors", "Books", "Collectibles", "Other",
] as const;

export const listingSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(3000),
  price: z.coerce.number().finite().min(0).max(9999999999.99),
  email: z.email(),
  category: z.enum(CATEGORIES),
});

export const messageSchema = z.object({
  listing_id: z.uuid(),
  buyer_name: z.string().trim().min(2).max(100),
  buyer_email: z.email(),
  message: z.string().trim().min(5).max(2000),
});

export type Listing = {
  id: string; title: string; description: string; price: number;
  email: string; category: (typeof CATEGORIES)[number]; image_path: string;
  created_at: string;
};

export function filterListings<T extends Pick<Listing, "title" | "description" | "category">>(
  listings: T[], category: string, search: string,
): T[] {
  const term = search.trim().toLocaleLowerCase();
  return listings.filter((listing) =>
    (category === "All" || listing.category === category) &&
    (!term || listing.title.toLocaleLowerCase().includes(term) || listing.description.toLocaleLowerCase().includes(term)),
  );
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(price);
}
