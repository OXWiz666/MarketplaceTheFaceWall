import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, supabaseConfigurationHelp } from "@/lib/supabase-server";
import { listingPayments } from "@/lib/stripe/listing-payments";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: `Marketplace database is not configured. ${supabaseConfigurationHelp()}` }, { status: 503 });
  const columns = "id,title,description,price,email,category,image_path,created_at";
  const query = (fields: string) => supabase.from("listings").select(fields).eq("id", id)
    .maybeSingle<{ id: string; email: string; price: number; image_path: string; status?: string }>();
  let { data, error } = await query(`${columns},status`);
  if (error?.code === "42703") ({ data, error } = await query(columns));
  if (error) {
    console.error("[api/listings/:id] Supabase query failed", { code: error.code, message: error.message });
    return NextResponse.json({ error: "Listing could not be loaded.", code: error.code }, { status: 502 });
  }
  if (!data) return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  const { data: image } = supabase.storage.from("marketplace-images").getPublicUrl(data.image_path);
  const payments = await listingPayments([data]);
  return NextResponse.json({ listing: { ...data, payment: payments.get(data.id), image_url: image.publicUrl } });
}
