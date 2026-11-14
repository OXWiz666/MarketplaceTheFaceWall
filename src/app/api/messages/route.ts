import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { messageSchema } from "@/lib/marketplace";
import { isRateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 10_000) return NextResponse.json({ error: "Message is too large." }, { status: 413 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(`message:${ip}`, 10)) return NextResponse.json({ error: "Too many messages. Please wait a minute before trying again." }, { status: 429 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Marketplace database is not configured." }, { status: 503 });
  let input: unknown;
  try { input = await request.json(); }
  catch { return NextResponse.json({ error: "Enter a valid message." }, { status: 400 }); }
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: "Check your name, email, and message, then try again." }, { status: 400 });
  const { error } = await supabase.from("seller_messages").insert(parsed.data);
  if (error) return NextResponse.json({ error: "Your message could not be saved. Please try again." }, { status: 502 });
  return NextResponse.json({ success: true }, { status: 201 });
}
