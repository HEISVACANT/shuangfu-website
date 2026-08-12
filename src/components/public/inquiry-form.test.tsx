import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { InquiryForm } from "./inquiry-form";
import type { ProductRecord } from "@/lib/content";
import { getCountryOptionsV1 } from "@/lib/country-options-v1";

const products: ProductRecord[] = [
  {
    id: "bp-001",
    slug: "bp-001",
    categoryId: "b8c8fe47-2268-4f88-bf2a-3d751c2fa004",
    categorySlug: "swimwear-cups",
    status: "published",
    sortOrder: 1,
    deletedAt: null,
    translations: {
      zh: { name: "轻盈胸垫", summary: "", description: "" },
      en: { name: "Light pad", summary: "", description: "" },
      ar: { name: "حشوة خفيفة", summary: "", description: "" },
    },
    images: [{ id: "bp-image", url: "/images/product-catalog-placeholder-v1.png", sortOrder: 0, alt: { zh: "胸垫", en: "Pad", ar: "حشوة" } }],
    specifications: [{ id: "bp-code", sortOrder: 0, label: { zh: "产品编号", en: "Product ID", ar: "رمز المنتج" }, value: { zh: "BP-001", en: "BP-001", ar: "BP-001" } }],
  },
  {
    id: "bp-002",
    slug: "bp-002",
    categoryId: "b8c8fe47-2268-4f88-bf2a-3d751c2fa004",
    categorySlug: "swimwear-cups",
    status: "published",
    sortOrder: 2,
    deletedAt: null,
    translations: {
      zh: { name: "柔软胸垫", summary: "", description: "" },
      en: { name: "Soft pad", summary: "", description: "" },
      ar: { name: "حشوة ناعمة", summary: "", description: "" },
    },
    images: [{ id: "bp2-image", url: "/images/product-catalog-placeholder-v1.png", sortOrder: 0, alt: { zh: "胸垫", en: "Pad", ar: "حشوة" } }],
    specifications: [{ id: "bp2-code", sortOrder: 0, label: { zh: "产品编号", en: "Product ID", ar: "رمز المنتج" }, value: { zh: "BP-002", en: "BP-002", ar: "BP-002" } }],
  },
  {
    id: "custom-001",
    slug: "custom-001",
    categoryId: "b8c8fe47-2268-4f88-bf2a-3d751c2fa003",
    categorySlug: "custom-development",
    status: "published",
    sortOrder: 1,
    deletedAt: null,
    translations: {
      zh: { name: "定制产品", summary: "", description: "" },
      en: { name: "Custom product", summary: "", description: "" },
      ar: { name: "منتج مخصص", summary: "", description: "" },
    },
    images: [],
    specifications: [{ id: "custom-code", sortOrder: 0, label: { zh: "产品编号", en: "Product ID", ar: "رمز المنتج" }, value: { zh: "CUSTOM-001", en: "CUSTOM-001", ar: "CUSTOM-001" } }],
  },
];
const countryOptions = getCountryOptionsV1("zh");
const categories = [
  {
    id: "b8c8fe47-2268-4f88-bf2a-3d751c2fa004",
    slug: "swimwear-cups",
    enabled: true,
    sortOrder: 0,
    productReferenceCount: 2,
    translations: {
      zh: { name: "泳装杯", description: "泳装结构" },
      en: { name: "Swimwear cups", description: "Swimwear structures" },
      ar: { name: "أكواب ملابس السباحة", description: "هياكل ملابس السباحة" }
    }
  },
  {
    id: "b8c8fe47-2268-4f88-bf2a-3d751c2fa005",
    slug: "retired-cups",
    enabled: false,
    sortOrder: 1,
    productReferenceCount: 1,
    translations: {
      zh: { name: "已停用分类", description: "仅后台可见" },
      en: { name: "Retired cups", description: "Admin only" },
      ar: { name: "أكواب متوقفة", description: "للإدارة فقط" }
    }
  },
  {
    id: "b8c8fe47-2268-4f88-bf2a-3d751c2fa003",
    slug: "custom-development",
    enabled: true,
    sortOrder: 2,
    productReferenceCount: 0,
    translations: {
      zh: { name: "定制开发", description: "定制结构" },
      en: { name: "Custom development", description: "Custom structures" },
      ar: { name: "تطوير مخصص", description: "هياكل مخصصة" }
    }
  }
];

describe("InquiryForm", () => {
  it("validates required privacy consent before submission", async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn();
    render(<InquiryForm categories={categories} countryOptions={countryOptions} fetcher={fetcher} locale="zh" products={products} />);

    await user.click(screen.getByRole("button", { name: "提交合作意向" }));

    expect(await screen.findByText("请填写所有必填项并同意隐私条款。"))
      .toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("copies the selected product into the form", async () => {
    render(<InquiryForm categories={categories} countryOptions={countryOptions} fetcher={vi.fn()} locale="zh" products={products} />);

    window.dispatchEvent(
      new CustomEvent("select-inquiry-product", {
        detail: { categoryId: categories[0].id, categorySlug: categories[0].slug, productId: "bp-001" }
      })
    );

    expect(await screen.findByText("轻盈胸垫")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "意向类目" })).toHaveValue(categories[0].id);
  });

  it("keeps exactly one selected product", async () => {
    const user = userEvent.setup();
    render(<InquiryForm categories={categories} countryOptions={countryOptions} fetcher={vi.fn()} locale="zh" products={products} />);

    await user.click(screen.getByRole("button", { name: "选择产品" }));
    expect(screen.getByRole("img", { name: "轻盈胸垫" })).toBeInTheDocument();
    expect(screen.getByText("轻盈胸垫")).toBeInTheDocument();
    expect(screen.getByText("BP-001")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "轻盈胸垫 BP-001" }));
    await user.click(screen.getByRole("checkbox", { name: "柔软胸垫 BP-002" }));

    expect(screen.getByRole("checkbox", { name: "轻盈胸垫 BP-001" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "柔软胸垫 BP-002" })).toBeChecked();
    expect(screen.getByText("已选择 1 个产品")).toBeInTheDocument();
  });

  it("clears the selected product when the category changes", async () => {
    const user = userEvent.setup();
    render(<InquiryForm categories={categories} countryOptions={countryOptions} fetcher={vi.fn()} locale="zh" products={products} />);

    await user.click(screen.getByRole("button", { name: "选择产品" }));
    await user.click(screen.getByRole("checkbox", { name: "轻盈胸垫 BP-001" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "意向类目" }), categories[2].id);

    expect(screen.queryByText("轻盈胸垫")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择产品" })).toBeDisabled();
  });

  it("replaces a previous selection when a catalog event switches categories", async () => {
    render(<InquiryForm categories={categories} countryOptions={countryOptions} fetcher={vi.fn()} locale="zh" products={products} />);

    window.dispatchEvent(new CustomEvent("select-inquiry-product", {
      detail: { categoryId: categories[0].id, categorySlug: categories[0].slug, productId: "bp-001" }
    }));
    expect(await screen.findByText("轻盈胸垫")).toBeInTheDocument();

    window.dispatchEvent(new CustomEvent("select-inquiry-product", {
      detail: { categoryId: categories[2].id, categorySlug: categories[2].slug, productId: "custom-001" }
    }));

    expect(await screen.findByText("定制产品")).toBeInTheDocument();
    expect(screen.queryByText("轻盈胸垫")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "意向类目" })).toHaveValue(categories[2].id);
  });

  it("uses a country selector with code and localized country name", () => {
    render(<InquiryForm
      countryOptions={[
        { code: "CN", name: "中国" },
        { code: "AE", name: "阿拉伯联合酋长国" },
        { code: "BR", name: "巴西" },
        { code: "FK", name: "服务端确定名称" },
      ]}
      categories={categories}
      fetcher={vi.fn()}
      locale="zh"
      products={products}
    />);

    const country = screen.getByRole("combobox", { name: "国家/地区代码" });
    expect(country).toHaveValue("CN");
    expect(screen.getByRole("option", { name: "CN · 中国" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "AE · 阿拉伯联合酋长国" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "BR · 巴西" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "FK · 服务端确定名称" })).toBeInTheDocument();
  });

  it("submits only the enabled category id and never a browser-provided category name", async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    render(<InquiryForm categories={categories} countryOptions={countryOptions} fetcher={fetcher} locale="zh" products={products} />);

    expect(screen.getByRole("option", { name: "泳装杯" })).toHaveValue(categories[0].id);
    expect(screen.queryByRole("option", { name: "已停用分类" })).not.toBeInTheDocument();
    for (const [name, value] of [
      ["姓名", "Amina Hassan"], ["公司", "Example Apparel"], ["邮箱", "amina@example.com"],
      ["电话 / WhatsApp", "+971 50 000 0000"], ["预计数量", "1000"]
    ] as const) await user.type(screen.getByRole("textbox", { name: new RegExp(name) }), value);
    await user.click(screen.getByRole("checkbox", { name: /privacy|隐私/i }));
    await user.click(screen.getByRole("button", { name: "提交合作意向" }));

    const request = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(request.categoryId).toBe(categories[0].id);
    expect(request.productId).toBeNull();
    expect(request).not.toHaveProperty("productIds");
    expect(request).not.toHaveProperty("productCategory");
    expect(request).not.toHaveProperty("categoryName");
  });

  it("uses the default CMS categories and sample products when props are omitted", async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    render(<InquiryForm fetcher={fetcher} locale="zh" />);

    const categorySelect = screen.getByRole("combobox", { name: "意向类目" });
    expect(categorySelect).not.toHaveValue("");
    await user.click(screen.getByRole("button", { name: "选择产品" }));
    expect(screen.getAllByRole("checkbox", { name: /.+/ }).length).toBeGreaterThan(1);

    for (const [name, value] of [
      ["姓名", "Amina Hassan"], ["公司", "Example Apparel"], ["邮箱", "amina@example.com"],
      ["电话 / WhatsApp", "+971 50 000 0000"], ["预计数量", "1000"]
    ] as const) await user.type(screen.getByRole("textbox", { name: new RegExp(name) }), value);
    await user.click(screen.getByRole("checkbox", { name: /privacy|隐私/i }));
    await user.click(screen.getByRole("button", { name: "提交合作意向" }));

    const request = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(request.categoryId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("keeps estimated quantity optional for the dynamic custom-development category", async () => {
    const user = userEvent.setup();
    render(<InquiryForm categories={categories} countryOptions={countryOptions} fetcher={vi.fn()} locale="zh" products={products} />);

    const category = categories.find((item) => item.slug === "custom-development")!;
    await user.selectOptions(screen.getByRole("combobox", { name: "意向类目" }), category.id);
    expect(screen.getByRole("textbox", { name: "预计数量（选填）" })).not.toBeRequired();
    expect(screen.getByRole("button", { name: "选择产品" })).toBeDisabled();
  });
});
