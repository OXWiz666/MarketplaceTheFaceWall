import { z } from "zod";

export const CATEGORIES = [
  "Electronics", "Vehicles", "Home & Furniture", "Fashion",
  "Sports & Outdoors", "Books", "Collectibles", "Other",
] as const;

export const FIELD_LIMITS = {
  title: { min: 3, max: 120 },
  description: { min: 10, max: 3000 },
  name: { min: 2, max: 100 },
  message: { min: 5, max: 2000 },
  email: 254,
  search: 120,
};
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

function requiredText(label: string, { min, max }: { min: number; max: number }) {
  return z.string({ error: `Enter ${label}.` }).trim()
    .min(1, `Enter ${label}.`)
    .min(min, `Use at least ${min} characters.`)
    .max(max, `Use no more than ${max.toLocaleString("en-US")} characters.`)
    .refine((value) => !value.includes("\0"), "Remove unsupported characters.");
}

export const emailSchema = z.string({ error: "Enter an email address." }).trim()
  .min(1, "Enter an email address.")
  .max(FIELD_LIMITS.email, "Use an email address with 254 characters or fewer.")
  .pipe(z.email({ error: "Enter a valid email address, such as you@example.com." }));
export const sellerEmail = emailSchema.transform((email) => email.toLowerCase());

export const priceSchema = z.string({ error: "Enter a price." }).trim()
  .min(1, "Enter a price.")
  .regex(/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/, "Enter a non-negative PHP amount with up to two decimal places.")
  .transform((value) => Number(value.replaceAll(",", "")))
  .pipe(z.number().max(9_999_999_999.99, "Enter a price of PHP 9,999,999,999.99 or less."));

export const listingSchema = z.object({
  title: requiredText("a title", FIELD_LIMITS.title),
  description: requiredText("a description", FIELD_LIMITS.description),
  price: priceSchema,
  email: sellerEmail,
  category: z.enum(CATEGORIES, { error: "Choose a category." }),
});

export const messageSchema = z.object({
  listing_id: z.uuid({ error: "Open a valid listing to message its seller." }),
  buyer_name: requiredText("your name", FIELD_LIMITS.name),
  buyer_email: emailSchema,
  message: requiredText("a message", FIELD_LIMITS.message),
});

export function photoError(file: File | null) {
  if (!file) return "Add a photo for your listing.";
  if (!file.size) return "This photo is empty. Choose another file.";
  if (file.size > MAX_IMAGE_BYTES) return "Choose a photo that is 5 MB or smaller.";
}

export function normalizeSearch(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, FIELD_LIMITS.search).trimEnd();
}

export type PaymentAvailability = "available" | "disabled" | "unavailable" | "price-unavailable" | "reserved" | "sold";

export type Listing = {
  id: string; title: string; description: string; price: number;
  email: string; category: (typeof CATEGORIES)[number]; image_path: string;
  created_at: string;
  payment?: PaymentAvailability;
};

export function filterListings<T extends Pick<Listing, "title" | "description" | "category">>(
  listings: readonly T[], category: string, search: string,
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
