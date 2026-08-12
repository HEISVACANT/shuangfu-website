import { LoginForm } from "@/components/admin/login-form";
import Link from "next/link";
export default function AdminLoginPage() { return <main className="admin-login"><div><span className="brand-mark">SF</span><p className="eyebrow">SHUANGFU CMS</p><h1>管理后台</h1><p>使用 Supabase Auth 管理员账号登录。服务端权限与数据库 RLS 会同时校验。</p><LoginForm /><Link href="/zh">← 返回官网</Link></div></main>; }
