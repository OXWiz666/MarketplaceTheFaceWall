import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Marketplace database is not configured." }, { status: 503 });
  const { data, error } = await supabase.from("listings").select("id,title,description,price,email,category,image_path,created_at").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: "Listing could not be loaded." }, { status: 502 });
  if (!data) return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  const { data: image } = supabase.storage.from("marketplace-images").getPublicUrl(data.image_path);
  return NextResponse.json({ listing: { ...data, image_url: image.publicUrl } });
}
