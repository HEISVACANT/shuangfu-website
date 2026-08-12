import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProductImageEditorV2 } from "@/components/admin/products/product-image-editor-v2";
import type { ProductImageV2 } from "@/lib/product-admin-v2";

const mediaId = "30000000-0000-4000-8000-000000000001";

function image(index: number, isPrimary = index === 0): ProductImageV2 {
  return {
    id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    mediaId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    url: `https://example.com/image-${index + 1}.webp`,
    variants: {},
    isPrimary,
    sortOrder: index,
    alt: { zh: "", en: "", ar: "" }
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProductImageEditorV2", () => {
  it("loads reusable media and adds only its persisted id and public URL", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [{
          id: mediaId,
          url: "https://example.com/library.webp",
          mimeType: "image/webp",
          byteSize: 1200,
          width: 800,
          height: 600,
          variants: { "480": "https://example.com/library-480.webp" },
          createdAt: "2026-07-29T08:00:00.000Z"
        }]
      })
    }));

    render(<ProductImageEditorV2 images={[]} locale="zh" onChange={onChange} />);

    await user.click(await screen.findByRole("button", { name: "选择媒体 library.webp" }));
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        mediaId,
        url: "https://example.com/library.webp",
        variants: { "480": "https://example.com/library-480.webp" },
        isPrimary: true,
        sortOrder: 0
      })
    ]);
  });

  it("enforces the ten-image limit and keeps exactly one selectable primary", async () => {
    const user = userEvent.setup();
    const initial = [image(0, true), image(1, false)];
    const onChange = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) }));

    const { rerender } = render(
      <ProductImageEditorV2 images={initial} locale="zh" onChange={onChange} />
    );
    await user.click(screen.getByRole("button", { name: "设为主图 配图 2" }));
    const changed = onChange.mock.calls.at(-1)?.[0] as ProductImageV2[];
    expect(changed.map((item) => item.isPrimary)).toEqual([false, true]);

    rerender(<ProductImageEditorV2 images={changed} locale="zh" onChange={onChange} />);
    expect(screen.getByTestId("primary-image")).toHaveAccessibleName("配图 2");
    expect(screen.getByRole("button", { name: "移除 配图 2" })).toBeDisabled();

    rerender(
      <ProductImageEditorV2
        images={Array.from({ length: 10 }, (_, index) => image(index))}
        locale="zh"
        onChange={onChange}
      />
    );
    expect(screen.getByText("最多上传 10 张图片")).toBeInTheDocument();
    expect(screen.getByLabelText("上传产品图片")).toBeDisabled();
  });

  it("repairs existing image data so exactly one image remains primary", async () => {
    const onChange = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) }));

    render(
      <ProductImageEditorV2
        images={[image(0, true), image(1, true)]}
        locale="zh"
        onChange={onChange}
      />
    );

    await waitFor(() => expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ isPrimary: true, sortOrder: 0 }),
      expect.objectContaining({ isPrimary: false, sortOrder: 1 })
    ]));
  });

  it("supports arrow and drag sorting while rewriting stable sortOrder values", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) }));
    const initial = [image(0, true), image(1, false), image(2, false)];
    const { rerender } = render(
      <ProductImageEditorV2 images={initial} locale="zh" onChange={onChange} />
    );

    await user.click(screen.getByRole("button", { name: "左移 配图 2" }));
    const arrowSorted = onChange.mock.calls.at(-1)?.[0] as ProductImageV2[];
    expect(arrowSorted.map((item) => item.id)).toEqual([initial[1].id, initial[0].id, initial[2].id]);
    expect(arrowSorted.map((item) => item.sortOrder)).toEqual([0, 1, 2]);

    rerender(<ProductImageEditorV2 images={initial} locale="zh" onChange={onChange} />);
    const cards = screen.getAllByTestId("product-image-card");
    fireEvent.dragStart(cards[2], { dataTransfer: { setData: vi.fn(), getData: () => "2" } });
    fireEvent.dragOver(cards[0]);
    fireEvent.drop(cards[0], { dataTransfer: { getData: () => "2" } });
    const dragSorted = onChange.mock.calls.at(-1)?.[0] as ProductImageV2[];
    expect(dragSorted.map((item) => item.id)).toEqual([initial[2].id, initial[0].id, initial[1].id]);
  });

  it("reuses the upload POST and exposes Arabic alt input as RTL", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: mediaId, storage_path: "https://example.com/upload.webp", variants: {} })
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<ProductImageEditorV2 images={[image(0)]} locale="ar" onChange={onChange} />);
    expect(screen.getByRole("textbox", { name: "图片说明 配图 1" })).toHaveAttribute("dir", "rtl");

    const file = new File(["image"], "sample.webp", { type: "image/webp" });
    await user.upload(screen.getByLabelText("上传产品图片"), file);
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/admin/media",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) })
    ));
  });

  it("merges a completed upload into the latest reordered images without rollback", async () => {
    const user = userEvent.setup();
    const uploadResponse = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) })
      .mockReturnValueOnce(uploadResponse.promise);
    vi.stubGlobal("fetch", fetchMock);

    function ControlledEditor() {
      const [images, setImages] = useState([image(0, true), image(1, false)]);
      return <ProductImageEditorV2 images={images} locale="zh" onChange={setImages} />;
    }

    render(<ControlledEditor />);
    await user.upload(
      screen.getByLabelText("上传产品图片"),
      new File(["image"], "race.webp", { type: "image/webp" })
    );
    await user.click(screen.getByRole("button", { name: "左移 配图 2" }));

    uploadResponse.resolve({
      ok: true,
      json: async () => ({
        id: mediaId,
        storage_path: "https://example.com/upload-race.webp",
        variants: {}
      })
    });

    await waitFor(() => {
      const sources = Array.from(
        screen.getByLabelText("已选产品图片").querySelectorAll("img")
      ).map((element) => element.getAttribute("src"));
      expect(sources).toEqual([
        "https://example.com/image-2.webp",
        "https://example.com/image-1.webp",
        "https://example.com/upload-race.webp"
      ]);
    });
  });
});
