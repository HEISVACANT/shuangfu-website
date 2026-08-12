import { Archive, Boxes, FileText, ImageIcon, LayoutDashboard, MailQuestion, Settings, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { logout } from "@/app/admin/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const nav = [["/admin/pages","页面内容",FileText],["/admin/products","产品目录",Boxes],["/admin/customization","定制开发",LayoutDashboard],["/admin/media","媒体库",ImageIcon],["/admin/inquiries","合作意向",MailQuestion],["/admin/users","用户与权限",Users],["/admin/audit","审计日志",Archive],["/admin/settings","系统设置",Settings]] as const;
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient(); const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const preview = !supabase; if (supabase && !data.user) return <div className="admin-auth-required"><ShieldCheck /><h1>需要管理员登录</h1><Link className="admin-primary" href="/admin/login">前往登录</Link></div>;
  return <div className="admin-shell"><aside><Link className="brand" href="/admin/pages"><span className="brand-mark">SF</span><span>双芙后台<small>CONTENT MANAGEMENT</small></span></Link><nav>{nav.map(([href,label,Icon])=><Link href={href} key={href}><Icon aria-hidden />{label}</Link>)}</nav><form action={logout}><button>退出登录</button></form></aside><div className="admin-main">{preview ? <div className="preview-banner">预览模式：配置 Supabase 环境变量并登录后，保存、发布、线索与权限操作才会持久化。</div> : null}{children}</div></div>;
}
