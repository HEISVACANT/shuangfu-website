import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "双芙辅料 | 胸垫、罩杯与服装辅料制造", template: "%s | 双芙辅料" },
  description: "六安市双芙服装辅料有限公司，专注胸垫、罩杯与服装服饰辅料制造。",
  robots: process.env.VERCEL_ENV === "production" ? { index: true, follow: true } : { index: false, follow: false }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html data-scroll-behavior="smooth" suppressHydrationWarning><body>{children}</body></html>;
}
