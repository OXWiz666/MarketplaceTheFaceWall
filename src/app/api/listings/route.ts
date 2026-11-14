import { NextRequest, NextResponse } from "next/server";
import { fileTypeFromBuffer } from "file-type";
import { getSupabaseServerClient, supabaseConfigurationHelp } from "@/lib/supabase-server";
import { CATEGORIES, IMAGE_TYPES, listingSchema, MAX_IMAGE_BYTES, normalizeSearch, photoError } from "@/lib/marketplace";
import { isRateLimited } from "@/lib/rate-limit";
import { listingPayments } from "@/lib/stripe/listing-payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function GET(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: `Marketplace database is not configured. ${supabaseConfigurationHelp()}` }, { status: 503 });
  const params = request.nextUrl.searchParams;
  const category = params.get("category");
  const search = normalizeSearch(params.get("search") ?? "");
  const sort = params.get("sort") ?? "newest";
  const requestedPage = Number(params.get("page") ?? 0);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 0;
  const pageSize = 24;
  const columns = "id,title,description,price,email,category,image_path,created_at";
  const listingQuery = (fields: string) => {
    let query = supabase.from("listings").select(fields, { count: "exact" });
    if (category && category !== "All" && CATEGORIES.includes(category as (typeof CATEGORIES)[number])) query = query.eq("category", category);
    const safeSearch = search.replace(/[^\p{L}\p{N}\s-]/gu, "").trim();
    if (search) {
      query = safeSearch ? query.or(`title.ilike.%${safeSearch}%,description.ilike.%${safeSearch}%`) : query.is("id", null);
    }
    if (sort === "oldest") query = query.order("created_at", { ascending: true });
    else if (sort === "price-asc") query = query.order("price", { ascending: true });
    else if (sort === "price-desc") query = query.order("price", { ascending: false });
    else query = query.order("created_at", { ascending: false });
    return query.order("id").range(page * pageSize, page * pageSize + pageSize - 1).returns<{
      id: string; email: string; price: number; image_path: string; status?: string;
    }[]>();
  };
  let { data, error, count } = await listingQuery(`${columns},status`);
  if (error?.code === "42703") ({ data, error, count } = await listingQuery(columns));
  if (error) {
    console.error("[api/listings] Supabase query failed", { code: error.code, message: error.message });
    const schemaMissing = error.code === "42P01" || error.code === "PGRST205";
    return NextResponse.json({
      error: schemaMissing ? "Marketplace tables are missing. Apply the Supabase migrations." : "Listings could not be loaded.",
      code: error.code,
    }, { status: schemaMissing ? 503 : 502 });
  }
  const payments = await listingPayments(data ?? []);
  const listings = (data ?? []).map((listing) => ({
    ...listing,
    payment: payments.get(listing.id),
    image_url: supabase.storage.from("marketplace-images").getPublicUrl(listing.image_path).data.publicUrl,
  }));
  return NextResponse.json({ listings, count: count ?? 0, page, pageSize });
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_IMAGE_BYTES + 32_768) return invalidPhotoResponse("Choose a photo that is 5 MB or smaller.", 413);
  if (isRateLimited(`listing:${clientKey(request)}`, 5)) return NextResponse.json({ error: "Too many listings submitted. Please wait a minute and try again." }, { status: 429 });
  try {
    const form = await request.formData();
    const parsed = listingSchema.safeParse({
      title: form.get("title"), description: form.get("description"), price: form.get("price"),
      email: form.get("email"), category: form.get("category"),
    });
    if (!parsed.success) return NextResponse.json({ error: "Check the listing details and try again.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    const file = form.get("photo");
    if (!(file instanceof File)) return invalidPhotoResponse("Add a photo for your listing.");
    const invalidPhoto = photoError(file);
    if (invalidPhoto) return invalidPhotoResponse(invalidPhoto);
    const bytes = Buffer.from(await file.arrayBuffer());
    const detected = await fileTypeFromBuffer(bytes).catch(() => undefined);
    if (!detected || !IMAGE_TYPES.includes(detected.mime)) return invalidPhotoResponse("Choose a valid JPEG, PNG, or WebP image.");

    const supabase = getSupabaseServerClient();
    if (!supabase) return NextResponse.json({ error: `Marketplace database is not configured. ${supabaseConfigurationHelp()}` }, { status: 503 });

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

function invalidPhotoResponse(message: string, status = 400) {
  return NextResponse.json({ error: message, fields: { photo: [message] } }, { status });
}
