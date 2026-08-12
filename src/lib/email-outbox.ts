import "server-only";
import { Resend } from "resend";
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";

const subjects = {
  zh: { owner: "新的双芙官网合作意向", customer: "我们已收到您的合作意向" },
  en: { owner: "New Shuangfu website inquiry", customer: "We received your inquiry" },
  ar: { owner: "استفسار جديد من موقع شوانغفو", customer: "لقد استلمنا استفسارك" }
} as const;

export async function processEmailOutbox(limit = 20) {
  if (!hasSupabaseAdminConfig() || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return { processed: 0, skipped: true };
  const supabase = createSupabaseAdminClient(); const resend = new Resend(process.env.RESEND_API_KEY);
  const { data: jobs, error } = await supabase.from("email_outbox").select("id,kind,recipient,locale,attempts,inquiry:inquiries(name,company,email,product_category,message)").in("status",["pending","failed"]).lte("next_attempt_at",new Date().toISOString()).order("created_at").limit(limit);
  if (error) throw error; let processed=0;
  for (const job of jobs ?? []) {
    await supabase.from("email_outbox").update({status:"sending"}).eq("id",job.id).in("status",["pending","failed"]);
    const inquiry = Array.isArray(job.inquiry) ? job.inquiry[0] : job.inquiry; const locale=(job.locale in subjects ? job.locale : "en") as keyof typeof subjects; const owner=job.kind==="owner_notification";
    const html=owner?`<h1>${subjects[locale].owner}</h1><p>${inquiry?.name ?? ""} · ${inquiry?.company ?? ""}</p><p>${inquiry?.email ?? ""}</p><p>${inquiry?.product_category ?? ""}</p><p>${inquiry?.message ?? ""}</p>`:`<h1>${subjects[locale].customer}</h1><p>${inquiry?.name ?? ""}</p><p>${locale==="zh"?"感谢联系双芙，我们会尽快回复。":locale==="ar"?"شكرًا لتواصلك مع شوانغفو. سنرد عليك قريبًا.":"Thank you for contacting Shuangfu. We will reply shortly."}</p>`;
    const result=await resend.emails.send({from:process.env.RESEND_FROM_EMAIL,to:job.recipient,subject:owner?subjects[locale].owner:subjects[locale].customer,html});
    if (result.error) { const attempts=job.attempts+1; await supabase.from("email_outbox").update({status:"failed",attempts,last_error:result.error.message,next_attempt_at:new Date(Date.now()+Math.min(24,2**attempts)*3600000).toISOString()}).eq("id",job.id); }
    else { await supabase.from("email_outbox").update({status:"sent",attempts:job.attempts+1,last_error:null,sent_at:new Date().toISOString()}).eq("id",job.id); }
    processed++;
  }
  return { processed, skipped:false };
}
