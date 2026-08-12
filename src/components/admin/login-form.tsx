"use client";
import { useActionState } from "react";
import { login } from "@/app/admin/actions";
export function LoginForm() { const [state, action, pending] = useActionState(login, { ok:false, message:"" }); return <form action={action} className="admin-login-form"><label>邮箱<input name="email" required type="email" /></label><label>密码<input name="password" required type="password" /></label>{state.message ? <p className="admin-message error">{state.message}</p> : null}<button className="admin-primary" disabled={pending}>{pending ? "登录中…" : "登录后台"}</button></form>; }
