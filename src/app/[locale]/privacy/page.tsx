import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";

const copy = {
  zh: { title:"隐私说明（预发布草案）", intro:"本说明用于预发布验收，正式上线前须由公司确认。", items:["合作咨询仅收集联系和项目沟通所需信息。","原始 IP 不写入咨询记录，仅使用带密钥的摘要进行 24 小时限流。","咨询不会自动清理；管理员可依据业务与合规要求执行软删除或受控永久删除。","如需查询、更正或删除信息，请通过官网公布的业务邮箱联系。"] },
  en: { title:"Privacy notice (pre-release draft)", intro:"This draft is for preview and must be approved by the company before launch.", items:["Inquiry data is collected only for contact and project communication.","Raw IP addresses are not stored with inquiries; a keyed digest is used for 24-hour rate limiting.","Inquiries are not automatically deleted and are subject to controlled administrator actions.","Contact the published business email to request access, correction or deletion."] },
  ar: { title:"إشعار الخصوصية (مسودة ما قبل الإطلاق)", intro:"هذه المسودة للمعاينة ويجب اعتمادها من الشركة قبل الإطلاق.", items:["نجمع بيانات الاستفسار للتواصل حول المشروع فقط.","لا نخزن عنوان IP الأصلي مع الاستفسار، بل نستخدم ملخصًا مشفرًا لتحديد المعدل لمدة 24 ساعة.","لا تُحذف الاستفسارات تلقائيًا وتخضع لإجراءات إدارية مضبوطة.","تواصل عبر بريد العمل المنشور لطلب الاطلاع أو التصحيح أو الحذف."] }
} as const;
export default async function PrivacyPage({params}:{params:Promise<{locale:string}>}){const {locale}=await params;if(!isLocale(locale))notFound();const text=copy[locale];return <main className="legal-page"><a href={`/${locale}`}>←</a><p className="eyebrow">PRIVACY</p><h1>{text.title}</h1><p>{text.intro}</p><ul>{text.items.map(item=><li key={item}>{item}</li>)}</ul></main>}
