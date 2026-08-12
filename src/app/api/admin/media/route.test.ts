import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, from, getUser, rpc } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  from: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

import { GET, POST } from "@/app/api/admin/media/route";

const mediaId = "50000000-0000-4000-8000-000000000001";

function client() {
  return { auth: { getUser }, from, rpc };
}

describe("admin media route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSupabaseServerClient.mockResolvedValue(client());
    getUser.mockResolvedValue({ data: { user: { id: "10000000-0000-4000-8000-000000000001" } }, error: null });
    rpc.mockResolvedValue({ data: true, error: null });
  });

  it("keeps POST upload protected by media:create", async () => {
    rpc.mockResolvedValue({ data: false, error: null });

    const response = await POST(new Request("http://localhost/api/admin/media", {
      method: "POST",
      body: new FormData()
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: "FORBIDDEN" });
    expect(rpc).toHaveBeenCalledWith("has_permission", {
      p_resource: "media",
      p_action: "create"
    });
  });

  it("requires a verified user for GET", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await GET(new Request("http://localhost/api/admin/media"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ code: "UNAUTHORIZED" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requires media:view for GET", async () => {
    rpc.mockResolvedValue({ data: false, error: null });

    const response = await GET(new Request("http://localhost/api/admin/media"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: "FORBIDDEN" });
    expect(rpc).toHaveBeenCalledWith("has_permission", {
      p_resource: "media",
      p_action: "view"
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("returns only safe media metadata, excludes deleted rows and orders newest first", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [{
        id: mediaId,
        storage_path: "https://example.com/media/original.webp",
        mime_type: "image/webp",
        byte_size: 2048,
        width: 960,
        height: 640,
        variants: { "480": "https://example.com/media/480.webp" },
        created_at: "2026-07-29T06:00:00.000Z",
        secret: "must-not-leak"
      }],
      error: null
    });
    const order = vi.fn().mockReturnValue({ limit });
    const is = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ is });
    from.mockReturnValue({ select });

    const response = await GET(new Request("http://localhost/api/admin/media"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      items: [{
        id: mediaId,
        url: "https://example.com/media/original.webp",
        mimeType: "image/webp",
        byteSize: 2048,
        width: 960,
        height: 640,
        variants: { "480": "https://example.com/media/480.webp" },
        createdAt: "2026-07-29T06:00:00.000Z"
      }]
    });
    expect(select).toHaveBeenCalledWith(
      "id,storage_path,mime_type,byte_size,width,height,variants,created_at"
    );
    expect(is).toHaveBeenCalledWith("deleted_at", null);
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(100);
  });

  it("trims and bounds an optional storage-path query", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const ilike = vi.fn().mockReturnValue({ order });
    const is = vi.fn().mockReturnValue({ ilike });
    const select = vi.fn().mockReturnValue({ is });
    from.mockReturnValue({ select });
    const query = `  ${"a".repeat(140)}  `;

    const response = await GET(new Request(`http://localhost/api/admin/media?query=${encodeURIComponent(query)}`));

    expect(response.status).toBe(200);
    expect(ilike).toHaveBeenCalledWith("storage_path", `%${"a".repeat(100)}%`);
    expect(limit).toHaveBeenCalledWith(100);
  });

  it("treats percent, underscore and backslash in a query as literal characters", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const ilike = vi.fn().mockReturnValue({ order });
    const is = vi.fn().mockReturnValue({ ilike });
    const select = vi.fn().mockReturnValue({ is });
    from.mockReturnValue({ select });

    const response = await GET(new Request(
      `http://localhost/api/admin/media?query=${encodeURIComponent("100%_draft\\file")}`
    ));

    expect(response.status).toBe(200);
    expect(ilike).toHaveBeenCalledWith("storage_path", "%100\\%\\_draft\\\\file%");
  });

  it("returns a controlled database error for failed or malformed media reads", async () => {
    const limit = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: "XX000" } })
      .mockResolvedValueOnce({ data: [{ id: "not-a-uuid" }], error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const is = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ is });
    from.mockReturnValue({ select });

    const failed = await GET(new Request("http://localhost/api/admin/media"));
    expect(failed.status).toBe(500);
    await expect(failed.json()).resolves.toEqual({ code: "DATABASE_ERROR" });

    const malformed = await GET(new Request("http://localhost/api/admin/media"));
    expect(malformed.status).toBe(500);
    await expect(malformed.json()).resolves.toEqual({ code: "DATABASE_ERROR" });
  });
});
