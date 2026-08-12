import { z } from "zod";

import { ProductAdminV2 } from "@/components/admin/products/product-admin-v2";
import type {
  AdminProductFilters,
  ProductStatusV2
} from "@/lib/product-admin-v2";
import {
  listAdminCategoriesV2,
  listAdminProductsV2
} from "@/lib/products-admin-repository-v2";
import { hasSupabaseAdminConfig } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ProductsAdminPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstSearchParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function parseStatus(value: string): ProductStatusV2 | null {
  if (value === "unpublished" || value === "published" || value === "archived") {
    return value;
  }
  return null;
}

function parseCategoryId(value: string): string | null {
  const categoryId = value.trim();
  return z.string().uuid().safeParse(categoryId).success ? categoryId : null;
}

export default async function ProductsAdmin({
  searchParams = Promise.resolve({})
}: ProductsAdminPageProps) {
  if (hasSupabaseAdminConfig() && !await canViewProductsV2()) return <AccessDenied />;

  const params = await searchParams;
  const filters: AdminProductFilters = {
    query: firstSearchParam(params.query),
    categoryId: parseCategoryId(firstSearchParam(params.category)),
    status: parseStatus(firstSearchParam(params.status))
  };
  const [products, categories] = await Promise.all([
    listAdminProductsV2(filters),
    listAdminCategoriesV2()
  ]);

  return (
    <ProductAdminV2
      categories={categories}
      filters={filters}
      products={products}
    />
  );
}

function AccessDenied() {
  return <div className="admin-card" role="alert">无法访问产品目录，请重新登录或联系管理员。</div>;
}

async function canViewProductsV2() {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return false;
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return false;
    const { data: allowed, error: permissionError } = await supabase.rpc(
      "has_permission",
      { p_resource: "products", p_action: "view" }
    );
    return !permissionError && allowed === true;
  } catch {
    return false;
  }
}
