import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots { if (process.env.VERCEL_ENV !== "production") return { rules: { userAgent: "*", disallow: "/" } }; return { rules: [{ userAgent: "*", allow: "/", disallow: "/admin" }], sitemap: `${process.env.NEXT_PUBLIC_SITE_URL}/sitemap.xml` }; }
