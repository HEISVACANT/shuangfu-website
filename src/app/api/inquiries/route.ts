import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { buildInquiryPersistenceV1, createIpHash, isInquiryQuantityValidForCategory, parseInquirySubmission } from "@/lib/inquiry";
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";
import { verifyTurnstile } from "@/lib/turnstile";

export async function POST(request: Request) {
  const parsed = parseInquirySubmission(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ code: parsed.code }, { status: parsed.code === "SPAM_DETECTED" ? 422 : 400 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!await verifyTurnstile(parsed.data.turnstileToken, ip === "unknown" ? undefined : ip)) return NextResponse.json({ code: "TURNSTILE_FAILED" }, { status: 403 });
  const id = randomUUID();
  if (!hasSupabaseAdminConfig()) {
    if (process.env.NODE_ENV === "production") return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
    return NextResponse.json({ inquiryId: id, accepted: true, persistence: "development-preview" }, { status: 202 });
  }
  const secret = process.env.IP_HASH_SECRET;
  const ownerEmail = process.env.INQUIRY_NOTIFICATION_EMAIL;
  if (!secret || !ownerEmail) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const supabase = createSupabaseAdminClient();
  const { data: category, error: categoryError } = await supabase
    .from("product_categories")
    .select("id, slug, is_enabled")
    .eq("id", parsed.data.categoryId)
    .maybeSingle();
  if (categoryError) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  if (!category?.is_enabled || !isInquiryQuantityValidForCategory(parsed.data, category.slug)) {
    return NextResponse.json({ code: "VALIDATION_ERROR" }, { status: 400 });
  }
  const ipHash = createIpHash(ip, secret);
  const { data: allowed, error: limitError } = await supabase.rpc("check_and_record_inquiry_rate_limit", { p_ip_hash: ipHash, p_email: parsed.data.email });
  if (limitError) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  if (!allowed) return NextResponse.json({ code: "RATE_LIMITED" }, { status: 429 });
  const persistence = buildInquiryPersistenceV1(parsed.data, { id, ownerEmail });
  const { error } = await supabase.rpc("accept_inquiry", persistence.rpcArgs);
  if (error) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  return NextResponse.json({ inquiryId: id, accepted: true }, { status: 202 });
}
