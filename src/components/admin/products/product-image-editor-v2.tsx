"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { Locale } from "@/lib/i18n";
import type { ProductImageV2 } from "@/lib/product-admin-v2";
import type { AdminMediaItem } from "@/lib/products-admin-repository-v2";

type ProductImageEditorV2Props = {
  images: ProductImageV2[];
  locale: Locale;
  onChange: (images: ProductImageV2[]) => void;
};

const MAX_IMAGES = 10;

function relationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? "00000000-0000-4000-8000-000000000000";
}

function mediaName(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "图片");
  } catch {
    return url.split("/").filter(Boolean).at(-1) ?? "图片";
  }
}

function normalizeOrder(images: ProductImageV2[]): ProductImageV2[] {
  return images.map((image, sortOrder) => ({ ...image, sortOrder }));
}

function mediaToProductImage(media: Pick<AdminMediaItem, "id" | "url" | "variants">, primary: boolean): ProductImageV2 {
  return {
    id: relationId(),
    mediaId: media.id,
    url: media.url,
    variants: media.variants,
    isPrimary: primary,
    sortOrder: 0,
    alt: { zh: "", en: "", ar: "" }
  };
}

export function ProductImageEditorV2({
  images,
  locale,
  onChange
}: ProductImageEditorV2Props) {
  const [media, setMedia] = useState<AdminMediaItem[]>([]);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const imagesRef = useRef(images);
  const atLimit = images.length >= MAX_IMAGES;

  const commit = useCallback((next: ProductImageV2[]) => {
    imagesRef.current = next;
    onChange(next);
  }, [onChange]);

  useLayoutEffect(() => {
    imagesRef.current = images;
  });

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/media")
      .then(async (response) => {
        if (!response.ok) throw new Error("媒体库加载失败");
        return response.json() as Promise<{ items?: AdminMediaItem[] }>;
      })
      .then((payload) => {
        if (active) setMedia(Array.isArray(payload.items) ? payload.items : []);
      })
      .catch(() => {
        if (active) setMessage("媒体库加载失败，仍可直接上传。");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (images.length === 0) return;
    if (images.filter((image) => image.isPrimary).length === 1) return;
    commit(normalizeOrder(images.map((image, index) => ({
      ...image,
      isPrimary: index === 0
    }))));
  }, [commit, images]);

  function addMedia(item: Pick<AdminMediaItem, "id" | "url" | "variants">) {
    const currentImages = imagesRef.current;
    if (currentImages.length >= MAX_IMAGES) {
      setMessage(`最多上传 ${MAX_IMAGES} 张图片`);
      return;
    }
    if (currentImages.some((image) => image.mediaId === item.id)) {
      setMessage("该图片已添加。");
      return;
    }
    commit(normalizeOrder([
      ...currentImages,
      mediaToProductImage(item, !currentImages.some((image) => image.isPrimary))
    ]));
    setMessage("");
  }

  function replaceImage(index: number, next: ProductImageV2) {
    commit(imagesRef.current.map((image, current) => (current === index ? next : image)));
  }

  function setPrimary(index: number) {
    commit(imagesRef.current.map((image, current) => ({ ...image, isPrimary: current === index })));
  }

  function move(from: number, to: number) {
    const currentImages = imagesRef.current;
    if (to < 0 || to >= currentImages.length || from === to) return;
    const next = [...currentImages];
    const [picked] = next.splice(from, 1);
    next.splice(to, 0, picked);
    commit(normalizeOrder(next));
  }

  async function upload(file?: File) {
    if (!file || atLimit) return;
    setUploading(true);
    setMessage("上传中…");
    const body = new FormData();
    body.set("file", file);
    try {
      const response = await fetch("/api/admin/media", { method: "POST", body });
      if (!response.ok) throw new Error("上传失败");
      const payload = await response.json() as {
        id?: string;
        url?: string;
        storage_path?: string;
        variants?: Record<string, string>;
      };
      const url = payload.url ?? payload.storage_path;
      if (!payload.id || !url) throw new Error("上传结果不完整");
      addMedia({ id: payload.id, url, variants: payload.variants ?? {} });
      setMessage("图片已上传并添加。");
    } catch {
      setMessage("图片上传失败，请检查格式、大小和权限。");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section aria-labelledby="product-images-title" style={{ gridColumn: "1 / -1" }}>
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
        <div>
          <h3 id="product-images-title" style={{ marginBottom: 4 }}>产品图片</h3>
          <small>{atLimit ? `最多上传 ${MAX_IMAGES} 张图片` : `已选 ${images.length}/${MAX_IMAGES} 张`}</small>
        </div>
        <label className="admin-secondary" style={{ alignItems: "center", display: "inline-flex" }}>
          {uploading ? "上传中…" : "上传新图片"}
          <input
            accept="image/jpeg,image/png,image/webp"
            aria-label="上传产品图片"
            className="sr-only"
            disabled={atLimit || uploading}
            onChange={(event) => void upload(event.target.files?.[0])}
            type="file"
          />
        </label>
      </div>

      {message ? <p className="admin-message" role="status">{message}</p> : null}

      <div aria-label="已选产品图片" style={{ display: "grid", gap: 12, marginTop: 14 }}>
        {images.map((image, index) => {
          const label = `配图 ${index + 1}`;
          return (
            <article
              data-testid="product-image-card"
              draggable
              key={image.id}
              onDragOver={(event) => event.preventDefault()}
              onDragStart={(event) => {
                dragIndex.current = index;
                event.dataTransfer.setData("text/plain", String(index));
              }}
              onDrop={(event) => {
                event.preventDefault();
                const source = dragIndex.current ?? Number(event.dataTransfer.getData("text/plain"));
                move(source, index);
                dragIndex.current = null;
              }}
              style={{ alignItems: "start", border: "1px solid #e4dedc", display: "grid", gap: 12, gridTemplateColumns: "96px 1fr auto", padding: 12 }}
            >
              {/* Native img is intentional: media URLs are selected dynamically by admins. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={label}
                data-testid={image.isPrimary ? "primary-image" : undefined}
                src={image.variants.thumbnail ?? image.variants["480"] ?? image.url}
                style={{ aspectRatio: "1", objectFit: "cover", width: 96 }}
              />
              <label style={{ display: "grid", fontSize: 11, gap: 6 }}>
                图片说明 {label}
                <input
                  aria-label={`图片说明 ${label}`}
                  dir={locale === "ar" ? "rtl" : "ltr"}
                  name={`images.${index}.alt.${locale}`}
                  onChange={(event) => replaceImage(index, {
                    ...image,
                    alt: { ...image.alt, [locale]: event.target.value }
                  })}
                  value={image.alt[locale]}
                />
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "end" }}>
                <button aria-label={`左移 ${label}`} disabled={index === 0} onClick={() => move(index, index - 1)} type="button">←</button>
                <button aria-label={`右移 ${label}`} disabled={index === images.length - 1} onClick={() => move(index, index + 1)} type="button">→</button>
                <button
                  aria-label={`设为主图 ${label}`}
                  disabled={image.isPrimary}
                  onClick={() => setPrimary(index)}
                  type="button"
                >
                  {image.isPrimary ? "当前主图" : "设为主图"}
                </button>
                <button
                  aria-label={`移除 ${label}`}
                  disabled={image.isPrimary}
                  onClick={() => commit(normalizeOrder(imagesRef.current.filter((_, current) => current !== index)))}
                  title={image.isPrimary ? "请先将其他图片设为主图" : undefined}
                  type="button"
                >移除</button>
              </div>
            </article>
          );
        })}
      </div>

      <div aria-label="媒体库" style={{ borderTop: "1px solid #eee9e7", marginTop: 18, paddingTop: 14 }}>
        <strong style={{ fontSize: 12 }}>从媒体库选择</strong>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {media.map((item) => (
            <button
              aria-label={`选择媒体 ${mediaName(item.url)}`}
              disabled={atLimit || images.some((image) => image.mediaId === item.id)}
              key={item.id}
              onClick={() => addMedia(item)}
              type="button"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" src={item.variants.thumbnail ?? item.variants["480"] ?? item.url} style={{ height: 64, objectFit: "cover", width: 64 }} />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
