import { NextRequest, NextResponse } from "next/server";
import { fileTypeFromBuffer } from "file-type";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { CATEGORIES, listingSchema } from "@/lib/marketplace";
import { isRateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const SAFE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Marketplace database is not configured." }, { status: 503 });
  const params = request.nextUrl.searchParams;
  const category = params.get("category");
  const search = params.get("search")?.trim().slice(0, 120) ?? "";
  const sort = params.get("sort") ?? "newest";
  const page = Math.max(0, Number(params.get("page") ?? 0) || 0);
  const pageSize = 24;
  let query = supabase.from("listings").select("id,title,description,price,email,category,image_path,created_at", { count: "exact" });
  if (category && category !== "All" && CATEGORIES.includes(category as (typeof CATEGORIES)[number])) query = query.eq("category", category);
  const safeSearch = search.replace(/[^\p{L}\p{N}\s-]/gu, "").trim();
  if (safeSearch) query = query.or(`title.ilike.%${safeSearch}%,description.ilike.%${safeSearch}%`);
  if (sort === "oldest") query = query.order("created_at", { ascending: true });
  else if (sort === "price-asc") query = query.order("price", { ascending: true });
  else if (sort === "price-desc") query = query.order("price", { ascending: false });
  else query = query.order("created_at", { ascending: false });
  const { data, error, count } = await query.range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) return NextResponse.json({ error: "Listings could not be loaded." }, { status: 502 });
  const listings = (data ?? []).map((listing) => ({
    ...listing,
    image_url: supabase.storage.from("marketplace-images").getPublicUrl(listing.image_path).data.publicUrl,
  }));
  return NextResponse.json({ listings, count: count ?? 0, page, pageSize });
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_IMAGE_BYTES + 32_768) return NextResponse.json({ error: "Listing request is too large." }, { status: 413 });
  if (isRateLimited(`listing:${clientKey(request)}`, 5)) return NextResponse.json({ error: "Too many listings submitted. Please wait a minute and try again." }, { status: 429 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Marketplace database is not configured." }, { status: 503 });
  try {
    const form = await request.formData();
    const parsed = listingSchema.safeParse({
      title: form.get("title"), description: form.get("description"), price: form.get("price"),
      email: form.get("email"), category: form.get("category"),
    });
    if (!parsed.success) return NextResponse.json({ error: "Check the listing details and try again.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    const file = form.get("photo");
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Please choose a listing photo." }, { status: 400 });
    if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Photo must be 5 MB or smaller." }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const detected = await fileTypeFromBuffer(bytes);
    if (!detected || !SAFE_IMAGE_TYPES.has(detected.mime)) return NextResponse.json({ error: "Upload a valid JPEG, PNG, or WebP image." }, { status: 400 });

    const imagePath = `${crypto.randomUUID()}.${detected.ext}`;
    const { error: uploadError } = await supabase.storage.from("marketplace-images").upload(imagePath, bytes, {
      contentType: detected.mime, upsert: false,
    });
    if (uploadError) return NextResponse.json({ error: "Photo upload failed. Please try again." }, { status: 502 });
    const { data, error: insertError } = await supabase.from("listings").insert({
      ...parsed.data, image_path: imagePath,
    }).select("id,title,description,price,email,category,image_path,created_at").single();
    if (insertError || !data) {
      await supabase.storage.from("marketplace-images").remove([imagePath]);
      return NextResponse.json({ error: "The listing could not be saved. Please try again." }, { status: 502 });
    }
    return NextResponse.json({ listing: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "The listing request was invalid or could not be processed." }, { status: 400 });
  }
}
