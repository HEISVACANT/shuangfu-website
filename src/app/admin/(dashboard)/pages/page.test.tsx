import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultSiteContentConfigV1 } from "@/lib/site-content-config-v1";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  getSiteContentConfigV1: vi.fn(),
  getUser: vi.fn(),
  hasSupabaseAdminConfig: vi.fn(),
  rpc: vi.fn()
}));

vi.mock("@/components/admin/page-content-editor-v1", () => ({
  PageContentEditorV1: () => <div>页面内容编辑器</div>
}));

vi.mock("@/lib/site-content-repository-v1", () => ({
  getSiteContentConfigV1: mocks.getSiteContentConfigV1
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
  hasSupabaseAdminConfig: mocks.hasSupabaseAdminConfig
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient
}));

import PagesAdmin from "@/app/admin/(dashboard)/pages/page";

describe("PagesAdmin permission boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasSupabaseAdminConfig.mockReturnValue(true);
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
      rpc: mocks.rpc
    });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "00000000-0000-4000-8000-000000000001" } },
      error: null
    });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.getSiteContentConfigV1.mockResolvedValue({
      config: structuredClone(defaultSiteContentConfigV1),
      baseline: { sections: [] },
      source: "fallback"
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn().mockResolvedValue({ data: [], error: null })
        }))
      }))
    });
  });

  it.each([
    ["no authenticated user", { data: { user: null }, error: null }, { data: true, error: null }],
    ["authentication error", { data: { user: null }, error: { message: "bad jwt" } }, { data: true, error: null }],
    ["permission denied", { data: { user: { id: "user" } }, error: null }, { data: false, error: null }],
    ["permission lookup error", { data: { user: { id: "user" } }, error: null }, { data: null, error: { message: "db failed" } }]
  ])("blocks %s before any service-role read", async (_case, authResult, permissionResult) => {
    mocks.getUser.mockResolvedValue(authResult);
    mocks.rpc.mockResolvedValue(permissionResult);

    render(await PagesAdmin());

    expect(screen.getByRole("alert")).toHaveTextContent("无法访问页面内容");
    expect(screen.queryByText("页面内容编辑器")).not.toBeInTheDocument();
    expect(mocks.getSiteContentConfigV1).not.toHaveBeenCalled();
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("checks pages/view before loading persisted configuration and media", async () => {
    render(await PagesAdmin());

    expect(mocks.rpc).toHaveBeenCalledWith("has_permission", {
      p_resource: "pages",
      p_action: "view"
    });
    expect(mocks.getSiteContentConfigV1).toHaveBeenCalledOnce();
    expect(mocks.createSupabaseAdminClient).toHaveBeenCalledOnce();
    expect(screen.getByText("页面内容编辑器")).toBeInTheDocument();
  });

  it("keeps local preview available when Supabase is not configured", async () => {
    mocks.hasSupabaseAdminConfig.mockReturnValue(false);

    render(await PagesAdmin());

    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
    expect(mocks.getSiteContentConfigV1).toHaveBeenCalledOnce();
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(screen.getByText("页面内容编辑器")).toBeInTheDocument();
  });
});
