import "server-only";
export async function verifyTurnstile(token: string, ip?: string) {
  if (process.env.NODE_ENV !== "production" && token === "development-bypass") return true;
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return false;
  const body = new FormData(); body.set("secret", secret); body.set("response", token); if (ip) body.set("remoteip", ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, cache: "no-store" });
  if (!response.ok) return false;
  return Boolean((await response.json() as { success?: boolean }).success);
}
