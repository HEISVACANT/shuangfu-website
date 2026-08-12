import { NextResponse } from "next/server";
import { isLocale, localizePath } from "@/lib/i18n";

export async function POST(request: Request) {
  const input = await request.json().catch(() => null) as { locale?: unknown; returnTo?: unknown } | null;
  if (!input || !isLocale(input.locale) || typeof input.returnTo !== "string" || !input.returnTo.startsWith("/") || input.returnTo.startsWith("//")) return NextResponse.json({ code: "VALIDATION_ERROR" }, { status: 400 });
  const destination = new URL(localizePath(input.returnTo, input.locale), request.url);
  const response = NextResponse.redirect(destination, 303);
  response.cookies.set("sf_locale", input.locale, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" });
  return response;
}
