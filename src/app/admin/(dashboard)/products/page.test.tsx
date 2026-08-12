import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getUser: vi.fn(),
  hasSupabaseAdminConfig: vi.fn(),
  listAdminCategoriesV2: vi.fn(),
  listAdminProductsV2: vi.fn(),
  rpc: vi.fn()
}));

vi.mock("@/components/admin/products/product-admin-v2", () => ({
  ProductAdminV2: () => <div>产品目录工作区</div>
}));

vi.mock("@/lib/products-admin-repository-v2", () => ({
  listAdminCategoriesV2: mocks.listAdminCategoriesV2,
  listAdminProductsV2: mocks.listAdminProductsV2
}));

vi.mock("@/lib/supabase/admin", () => ({
  hasSupabaseAdminConfig: mocks.hasSupabaseAdminConfig
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient
}));

import ProductsAdmin from "@/app/admin/(dashboard)/products/page";

describe("ProductsAdmin permission boundary", () => {
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
    mocks.listAdminCategoriesV2.mockResolvedValue([]);
    mocks.listAdminProductsV2.mockResolvedValue([]);
  });

  it.each([
    ["no authenticated user", { data: { user: null }, error: null }, { data: true, error: null }],
    ["authentication error", { data: { user: null }, error: { message: "bad jwt" } }, { data: true, error: null }],
    ["permission denied", { data: { user: { id: "user" } }, error: null }, { data: false, error: null }],
    ["permission lookup error", { data: { user: { id: "user" } }, error: null }, { data: null, error: { message: "db failed" } }]
  ])("blocks %s before any service-role read", async (_case, authResult, permissionResult) => {
    mocks.getUser.mockResolvedValue(authResult);
    mocks.rpc.mockResolvedValue(permissionResult);

    render(await ProductsAdmin({}));

    expect(screen.getByRole("alert")).toHaveTextContent("无法访问产品目录");
    expect(screen.queryByText("产品目录工作区")).not.toBeInTheDocument();
    expect(mocks.listAdminCategoriesV2).not.toHaveBeenCalled();
    expect(mocks.listAdminProductsV2).not.toHaveBeenCalled();
  });

  it("checks products/view before loading categories and products", async () => {
    render(await ProductsAdmin({}));

    expect(mocks.rpc).toHaveBeenCalledWith("has_permission", {
      p_resource: "products",
      p_action: "view"
    });
    expect(mocks.listAdminCategoriesV2).toHaveBeenCalledOnce();
    expect(mocks.listAdminProductsV2).toHaveBeenCalledWith({
      query: "",
      categoryId: null,
      status: null
    });
    expect(screen.getByText("产品目录工作区")).toBeInTheDocument();
  });

  it("keeps the local fallback available when Supabase is not configured", async () => {
    mocks.hasSupabaseAdminConfig.mockReturnValue(false);

    render(await ProductsAdmin({}));

    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
    expect(mocks.listAdminCategoriesV2).toHaveBeenCalledOnce();
    expect(mocks.listAdminProductsV2).toHaveBeenCalledOnce();
    expect(screen.getByText("产品目录工作区")).toBeInTheDocument();
  });
});
