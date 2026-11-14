import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, supabaseConfigurationHelp } from "@/lib/supabase-server";
import { messageSchema } from "@/lib/marketplace";
import { isRateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 10_000) return NextResponse.json({ error: "Message is too large." }, { status: 413 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(`message:${ip}`, 10)) return NextResponse.json({ error: "Too many messages. Please wait a minute before trying again." }, { status: 429 });
  let input: unknown;
  try { input = await request.json(); }
  catch { return NextResponse.json({ error: "Enter a valid message." }, { status: 400 }); }
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: "Check your message details.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: `Marketplace database is not configured. ${supabaseConfigurationHelp()}` }, { status: 503 });
  const { error } = await supabase.from("seller_messages").insert(parsed.data);
  if (error) {
    console.error("[api/messages] Supabase insert failed", { code: error.code, message: error.message });
    return NextResponse.json({ error: "Your message could not be saved. Please try again.", code: error.code }, { status: 502 });
  }
  return NextResponse.json({ success: true }, { status: 201 });
}
