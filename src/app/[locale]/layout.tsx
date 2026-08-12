import { notFound } from "next/navigation";
import { isLocale, localeDirection } from "@/lib/i18n";

export function generateStaticParams() { return [{ locale: "zh" }, { locale: "en" }, { locale: "ar" }]; }

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <div dir={localeDirection(locale)} lang={locale} className={`locale-shell locale-${locale}`}>{children}</div>;
}
