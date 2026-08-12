import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !secret) {
  throw new Error("Supabase server environment is incomplete");
}

const supabase = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const verificationId = randomUUID();
const storagePath = `verification/${verificationId}.png`;
const verificationEmail = `verify-${verificationId}@example.invalid`;
const ipHash = `verification-${verificationId}`;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

let inquiryCreated = false;
let rateLimitCreated = false;
let storageCreated = false;

try {
  const { error: uploadError } = await supabase.storage
    .from("media")
    .upload(storagePath, png, { contentType: "image/png", upsert: false });
  if (uploadError) throw uploadError;
  storageCreated = true;

  const publicUrl = supabase.storage.from("media").getPublicUrl(storagePath).data
    .publicUrl;
  const imageResponse = await fetch(publicUrl);
  if (!imageResponse.ok) {
    throw new Error(`Public media fetch failed with ${imageResponse.status}`);
  }

  const { data: allowed, error: limitError } = await supabase.rpc(
    "check_and_record_inquiry_rate_limit",
    { p_ip_hash: ipHash, p_email: verificationEmail },
  );
  if (limitError) throw limitError;
  if (!allowed) throw new Error("Verification inquiry was unexpectedly limited");
  rateLimitCreated = true;

  const payload = {
    name: "Supabase Verification",
    company: "Shuangfu Staging",
    email: verificationEmail,
    phoneWhatsApp: "+000000000",
    productCategory: "bra-pads",
    productId: "",
    estimatedQuantity: "1",
    message: "Temporary connectivity verification; safe to delete.",
    privacyConsent: true,
    locale: "en",
  };
  const { error: inquiryError } = await supabase.rpc("accept_inquiry", {
    p_id: verificationId,
    p_payload: payload,
    p_country_code: "CN",
    p_owner_email: verificationEmail,
  });
  if (inquiryError) throw inquiryError;
  inquiryCreated = true;

  const { count: inquiryCount, error: inquiryReadError } = await supabase
    .from("inquiries")
    .select("id", { count: "exact", head: true })
    .eq("id", verificationId);
  if (inquiryReadError) throw inquiryReadError;

  const { count: outboxCount, error: outboxReadError } = await supabase
    .from("email_outbox")
    .select("id", { count: "exact", head: true })
    .eq("inquiry_id", verificationId);
  if (outboxReadError) throw outboxReadError;

  if (inquiryCount !== 1 || outboxCount !== 2) {
    throw new Error(
      `Unexpected verification counts: inquiry=${inquiryCount}, outbox=${outboxCount}`,
    );
  }

  console.log("SUPABASE_SERVER_CONNECTION_OK");
  console.log("SUPABASE_STORAGE_UPLOAD_AND_PUBLIC_READ_OK");
  console.log("SUPABASE_INQUIRY_AND_OUTBOX_TRANSACTION_OK");
} finally {
  if (inquiryCreated) {
    await supabase.from("inquiries").delete().eq("id", verificationId);
  }
  if (rateLimitCreated) {
    await supabase.from("inquiry_rate_limits").delete().eq("ip_hash", ipHash);
  }
  if (storageCreated) {
    await supabase.storage.from("media").remove([storagePath]);
  }
  console.log("SUPABASE_VERIFICATION_DATA_CLEANED");
}
