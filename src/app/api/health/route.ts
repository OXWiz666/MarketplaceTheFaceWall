import { NextResponse } from "next/server";
import { getSupabaseServerClient, supabaseConfigurationHelp } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ status: "missing-config", help: supabaseConfigurationHelp() }, { status: 503 });
  const { error } = await supabase.from("listings").select("id", { head: true, count: "exact" }).limit(1);
  if (error) {
    console.error("[api/health] Supabase check failed", { code: error.code, message: error.message });
    return NextResponse.json({ status: "database-error", code: error.code }, { status: 503 });
  }
  return NextResponse.json({ status: "ok", database: "connected" });
}
