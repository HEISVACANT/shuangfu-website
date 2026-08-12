import Image from "next/image";

import type { Locale } from "@/lib/i18n";
import styles from "@/components/public/brand-lockup-v1.module.css";

const wordmarks = {
  en: {
    alt: "SHUANGFU",
    className: `brand-wordmark brand-wordmark-en ${styles.wordmark} ${styles.wordmarkEn}`,
    height: 33,
    src: "/images/shuangfu-wordmark-en-v1.png",
    width: 172,
  },
  zh: {
    alt: "双芙",
    className: `brand-wordmark brand-wordmark-zh ${styles.wordmark} ${styles.wordmarkZh}`,
    height: 39,
    src: "/images/shuangfu-wordmark-zh-v1.png",
    width: 98,
  },
} as const;

export function BrandLockupV1({ locale, priority = false }: { locale: Locale; priority?: boolean }) {
  const wordmark = wordmarks[locale === "zh" ? "zh" : "en"];

  return (
    <span className={`brand-lockup ${styles.lockup}`} dir="ltr">
      <Image
        alt=""
        aria-hidden="true"
        className={`brand-symbol ${styles.symbol}`}
        height={97}
        priority={priority}
        src="/images/shuangfu-symbol-v1.png"
        width={123}
      />
      <Image
        alt={wordmark.alt}
        className={wordmark.className}
        height={wordmark.height}
        priority={priority}
        src={wordmark.src}
        width={wordmark.width}
      />
    </span>
  );
}
