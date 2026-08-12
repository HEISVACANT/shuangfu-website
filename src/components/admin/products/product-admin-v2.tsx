import Image from "next/image";
import { z } from "zod";

import { AdminHeader, Status } from "@/components/admin/admin-ui";
import { ProductDialogsV2 } from "@/components/admin/products/product-confirm-dialog-v2";
import { ProductDrawerV2 } from "@/components/admin/products/product-drawer-v2";
import type {
  AdminProductFilters,
  ProductCategoryV2,
  ProductRecordV2,
  ProductStatusV2
} from "@/lib/product-admin-v2";
import { getAdminProductV2 } from "@/lib/products-admin-repository-v2";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ProductAdminV2Props = {
  products: ProductRecordV2[];
  categories: ProductCategoryV2[];
  filters: AdminProductFilters;
};

const statusLabels: Record<ProductStatusV2, string> = {
  unpublished: "未发布",
  published: "已发布",
  archived: "已下架"
};

const productTableColumns = "88px minmax(170px, 1.4fr) minmax(110px, .7fr) minmax(130px, .8fr) 100px minmax(250px, 1.4fr)";

function displayChineseText(value: string, fallback: string): string {
  return value.trim() || fallback;
}

export async function loadAdminProductDetail(id: string): Promise<ProductRecordV2 | null> {
  "use server";
  if (!z.string().uuid().safeParse(id).success) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const permission = await supabase.rpc("has_permission", {
    p_resource: "products",
    p_action: "view"
  });
  if (permission.error || !permission.data) return null;
  return getAdminProductV2(id);
}

export function ProductAdminV2({
  products,
  categories,
  filters
}: ProductAdminV2Props) {
  const categoriesById = new Map(categories.map((category) => [category.id, category]));

  return (
    <>
      <AdminHeader
        actions={
          <button
            className="admin-primary"
            data-product-action="create"
            type="button"
          >
            新建产品
          </button>
        }
        description="管理产品的三语介绍、图片、规格与发布状态。"
        eyebrow="CATALOG"
        title="产品目录"
      />

      <form
        action="/admin/products"
        aria-label="产品查询"
        className="admin-toolbar"
        method="get"
        role="search"
        style={{ flexWrap: "wrap" }}
      >
        <label className="sr-only" htmlFor="product-query">
          名称或编号
        </label>
        <input
          defaultValue={filters.query}
          id="product-query"
          name="query"
          placeholder="搜索名称或产品编号"
          style={{ flex: "1 1 240px", minWidth: 0 }}
          type="search"
        />

        <label className="sr-only" htmlFor="product-category">
          分类
        </label>
        <select
          defaultValue={filters.categoryId ?? ""}
          id="product-category"
          name="category"
          style={{ flex: "1 1 160px", minWidth: 0 }}
        >
          <option value="">全部分类</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {displayChineseText(category.translations.zh.name, "未命名分类")}
              {category.isEnabled ? "" : "（已停用）"}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="product-status">
          状态
        </label>
        <select
          defaultValue={filters.status ?? ""}
          id="product-status"
          name="status"
          style={{ flex: "1 1 140px", minWidth: 0 }}
        >
          <option value="">全部状态</option>
          <option value="unpublished">未发布</option>
          <option value="published">已发布</option>
          <option value="archived">已下架</option>
        </select>

        <button
          className="admin-primary"
          style={{ flexShrink: 0 }}
          type="submit"
        >
          查询
        </button>
      </form>

      <div aria-label="产品列表" className="admin-table product-table" role="table">
        <div
          className="table-row table-head"
          role="row"
          style={{ gridTemplateColumns: productTableColumns }}
        >
          <span role="columnheader">主图</span>
          <span role="columnheader">产品名称</span>
          <span role="columnheader">编号</span>
          <span role="columnheader">分类</span>
          <span role="columnheader">状态</span>
          <span role="columnheader">操作</span>
        </div>

        {products.map((product) => {
          const primaryImage = product.images.find((image) => image.isPrimary);
          const category = categoriesById.get(product.categoryId) ?? product.category;
          const published = product.status === "published";
          const editDescriptionId = `edit-description-${product.id}`;
          const deleteDescriptionId = `delete-description-${product.id}`;

          return (
            <div
              className="table-row"
              data-testid="product-row"
              key={product.id}
              role="row"
              style={{ gridTemplateColumns: productTableColumns }}
            >
              <span role="cell">
                {primaryImage ? (
                  <Image
                    alt={primaryImage.alt.zh || `${product.code} 主图`}
                    height={52}
                    src={primaryImage.variants.thumbnail ?? primaryImage.url}
                    unoptimized
                    width={52}
                  />
                ) : (
                  <span className="admin-warning">无主图</span>
                )}
              </span>
              <span role="cell">
                <strong>
                  {displayChineseText(product.translations.zh.name, "未填写")}
                </strong>
              </span>
              <span role="cell">{product.code}</span>
              <span role="cell">
                {displayChineseText(category.translations.zh.name, "未命名分类")}
                {category.isEnabled ? "" : "（已停用）"}
              </span>
              <span role="cell">
                <Status tone={product.status}>{statusLabels[product.status]}</Status>
              </span>
              <span role="cell">
                <button
                  aria-label={`查看 ${product.code}`}
                  data-product-action="view"
                  data-product-id={product.id}
                  type="button"
                >
                  查看
                </button>
                <button
                  aria-label={`发布状态 ${product.code}`}
                  data-product-action="status"
                  data-product-id={product.id}
                  data-product-status={product.status}
                  type="button"
                >
                  发布状态
                </button>
                <button
                  aria-describedby={published ? editDescriptionId : undefined}
                  aria-label={`编辑 ${product.code}`}
                  data-product-action="edit"
                  data-product-id={product.id}
                  data-product-status={product.status}
                  disabled={published}
                  style={
                    published ? { cursor: "not-allowed", opacity: 0.45 } : undefined
                  }
                  type="button"
                >
                  编辑
                </button>
                <button
                  aria-describedby={published ? deleteDescriptionId : undefined}
                  aria-label={`删除 ${product.code}`}
                  data-product-action="delete"
                  data-product-id={product.id}
                  data-product-status={product.status}
                  disabled={published}
                  style={
                    published ? { cursor: "not-allowed", opacity: 0.45 } : undefined
                  }
                  type="button"
                >
                  删除
                </button>
                {published ? (
                  <>
                    <span className="sr-only" id={editDescriptionId}>
                      已发布产品需先下架后才能编辑
                    </span>
                    <span className="sr-only" id={deleteDescriptionId}>
                      已发布产品需先下架后才能删除
                    </span>
                  </>
                ) : null}
              </span>
            </div>
          );
        })}

        {products.length === 0 ? (
          <div
            className="table-row"
            role="row"
            style={{ gridTemplateColumns: productTableColumns }}
          >
            <span
              className="admin-empty"
              role="cell"
              style={{ gridColumn: "1 / -1" }}
            >
              没有符合条件的产品
            </span>
          </div>
        ) : null}
      </div>
      <ProductDrawerV2
        categories={categories}
        loadProduct={loadAdminProductDetail}
      />
      <ProductDialogsV2 loadProduct={loadAdminProductDetail} />
    </>
  );
}
