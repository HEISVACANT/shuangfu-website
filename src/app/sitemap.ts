import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap { const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"; return ["zh", "en", "ar"].map((locale) => ({ url: `${base}/${locale}`, lastModified: new Date(), changeFrequency: "weekly", priority: locale === "en" ? 1 : 0.9 })); }
