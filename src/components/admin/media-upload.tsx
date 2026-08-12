"use client";

import { useRef, useState } from "react";

export interface MediaRecord {
  id: string;
  storage_path: string;
  variants: Record<string, string>;
}

export function MediaUpload({ onUploaded }: { onUploaded?: (media: MediaRecord) => void } = {}) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");

  async function upload(file?: File) {
    if (!file) return;
    const data = new FormData();
    data.set("file", file);
    setMessage("上传并生成响应式图片中…");
    try {
      const response = await fetch("/api/admin/media", { method: "POST", body: data });
      if (!response.ok) throw new Error("upload_failed");
      const uploaded = parseMediaRecord(await response.json());
      onUploaded?.(uploaded);
      setMessage(onUploaded ? "上传成功，已选用新图片。" : "上传成功，刷新页面后可见。");
    } catch {
      setMessage("上传失败：请检查登录权限、格式与 10 MB 限制。");
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="media-upload">
      <input
        accept="image/jpeg,image/png,image/webp"
        aria-label="选择图片"
        className="sr-only"
        onChange={(event) => void upload(event.target.files?.[0])}
        ref={input}
        type="file"
      />
      <button className="admin-primary" onClick={() => input.current?.click()} type="button">上传图片</button>
      {message ? <span role="status">{message}</span> : null}
    </div>
  );
}

function parseMediaRecord(value: unknown): MediaRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("media_response_invalid");
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.storage_path !== "string") {
    throw new Error("media_response_invalid");
  }
  const variants = record.variants;
  if (!variants || typeof variants !== "object" || Array.isArray(variants)) {
    throw new Error("media_response_invalid");
  }
  const normalizedVariants: Record<string, string> = {};
  for (const [key, url] of Object.entries(variants)) {
    if (typeof url !== "string") throw new Error("media_response_invalid");
    normalizedVariants[key] = url;
  }
  return { id: record.id, storage_path: record.storage_path, variants: normalizedVariants };
}
