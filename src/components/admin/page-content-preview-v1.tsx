"use client";

import { useEffect, useState } from "react";

import { SiteSectionsV1, type ProductsByCategoryV1 } from "@/components/public/site-sections-v1";
import {
  isPageContentPreviewChannelIdV1,
  pageContentPreviewChannelPrefixV1,
  pageContentPreviewConsumerTimeoutMsV1,
  pageContentPreviewProducerTimeoutMsV1
} from "@/lib/page-content-preview-v1";
import { siteContentConfigSchemaV1, type SiteContentConfigV1 } from "@/lib/site-content-config-v1";
import type { Locale } from "@/lib/i18n";
import styles from "@/components/admin/page-content-preview-v1.module.css";

type PreviewStatusV1 = "loading" | "ready" | "missing";

export function openOneTimePreviewChannelV1(
  channelId: string,
  config: SiteContentConfigV1,
  options: { timeoutMs?: number; onTimeout?: () => void } = {}
): () => void {
  if (!isPageContentPreviewChannelIdV1(channelId)) {
    throw new Error("invalid_preview_channel_id");
  }
  const parsed = siteContentConfigSchemaV1.parse(config);
  const channel = new BroadcastChannel(`${pageContentPreviewChannelPrefixV1}${channelId}`);
  let closed = false;
  let responded = false;
  const timeoutMs = options.timeoutMs ?? pageContentPreviewProducerTimeoutMsV1;
  const close = () => {
    if (closed) return;
    closed = true;
    window.clearTimeout(timer);
    channel.onmessage = null;
    channel.close();
  };
  const timer = window.setTimeout(() => {
    close();
    options.onTimeout?.();
  }, timeoutMs);
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (responded || !isReadyMessageV1(event.data)) return;
    responded = true;
    channel.postMessage({ type: "config", payload: parsed });
    close();
  };
  return close;
}

export function PageContentPreviewV1({
  channelId,
  productsByCategory = {},
  timeoutMs = pageContentPreviewConsumerTimeoutMsV1
}: {
  channelId: string;
  productsByCategory?: ProductsByCategoryV1;
  timeoutMs?: number;
}) {
  const [config, setConfig] = useState<SiteContentConfigV1 | null>(null);
  const [status, setStatus] = useState<PreviewStatusV1>("loading");
  const [locale, setLocale] = useState<Locale>("zh");
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const validChannelId = isPageContentPreviewChannelIdV1(channelId);

  useEffect(() => {
    if (!validChannelId) return;
    if (typeof BroadcastChannel === "undefined") {
      const unsupportedTimer = window.setTimeout(() => setStatus("missing"));
      return () => window.clearTimeout(unsupportedTimer);
    }

    const channel = new BroadcastChannel(`${pageContentPreviewChannelPrefixV1}${channelId}`);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      window.clearTimeout(timer);
      channel.onmessage = null;
      channel.close();
    };
    const timer = window.setTimeout(() => {
      close();
      setStatus("missing");
    }, timeoutMs);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (closed || !isConfigMessageV1(event.data)) return;
      const parsed = siteContentConfigSchemaV1.safeParse(event.data.payload);
      if (!parsed.success) return;
      setConfig(parsed.data);
      setStatus("ready");
      close();
    };
    channel.postMessage({ type: "ready" });
    return close;
  }, [channelId, timeoutMs, validChannelId]);

  if (!validChannelId || status === "missing") {
    return (
      <section className={styles.missing} role="alert">
        <h1>没有可预览的未保存内容</h1>
        <p>请返回页面内容编辑页重新点击“预览效果”。</p>
      </section>
    );
  }

  if (!config || status !== "ready") {
    return <p className={styles.loading} role="status">正在读取未保存的页面配置…</p>;
  }

  return (
    <div className={styles.preview}>
      <header className={styles.toolbar}>
        <div>
          <strong>未保存效果预览</strong>
          <span>此页仅显示本次临时配置，不会写入数据库。</span>
        </div>
        <div aria-label="预览语言" className={styles.switches} role="group">
          {([["zh", "中文"], ["en", "English"], ["ar", "العربية"]] as const).map(([value, label]) => (
            <button aria-pressed={locale === value} key={value} onClick={() => setLocale(value)} type="button">{label}</button>
          ))}
        </div>
        <div aria-label="预览宽度" className={styles.switches} role="group">
          <button aria-pressed={viewport === "desktop"} onClick={() => setViewport("desktop")} type="button">桌面端</button>
          <button aria-pressed={viewport === "mobile"} onClick={() => setViewport("mobile")} type="button">移动端</button>
        </div>
      </header>
      <div className={styles.stage}>
        <div className={styles.frame} data-testid="page-content-preview-frame" data-viewport={viewport}>
          <SiteSectionsV1 config={config} locale={locale} productsByCategory={productsByCategory} viewport={viewport} />
        </div>
      </div>
    </div>
  );
}

function isReadyMessageV1(value: unknown): value is { type: "ready" } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && (value as { type?: unknown }).type === "ready");
}

function isConfigMessageV1(value: unknown): value is { type: "config"; payload: unknown } {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && (value as { type?: unknown }).type === "config"
    && "payload" in value
  );
}
