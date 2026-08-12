"use client";
import { useActionState } from "react";
import type { AdminActionState } from "@/app/admin/actions";

export function ActionForm({ action, children, className, submitLabel="保存更改" }: { action: (state: AdminActionState, data: FormData) => Promise<AdminActionState>; children: React.ReactNode; className?: string; submitLabel?: string }) {
  const [state, formAction, pending] = useActionState(action, { ok: false, message: "" });
  return <form action={formAction} className={className}>{children}{state.message ? <p className={state.ok ? "admin-message success" : "admin-message error"}>{state.message}</p> : null}<button className="admin-primary" disabled={pending} type="submit">{pending ? "正在处理…" : submitLabel}</button></form>;
}
