"use client";

import Image from "next/image";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Script from "next/script";

import type { ProductRecord } from "@/lib/content";
import type { CountryOption } from "@/lib/country-options-v1";
import type { Locale } from "@/lib/i18n";
import { sampleProducts } from "@/lib/site-content";
import { defaultSiteContentConfigV1, getSectionConfigV1, type ProductCategoryV1 } from "@/lib/site-content-config-v1";

type Fetcher = typeof fetch;

const formCopy = {
  zh: {
    title: "告诉我们您的合作需求",
    introBefore: "提交后，我们会尽快与您联系。带 ",
    introAfter: " 为必填项。",
    name: "姓名",
    company: "公司",
    country: "国家/地区代码",
    optional: "（选填）",
    email: "邮箱",
    phone: "电话 / WhatsApp",
    category: "意向类目",
    product: "意向产品（选填）",
    chooseProduct: "选择产品",
    selectedProducts: (count: number) => `已选择 ${count} 个产品`,
    noProducts: "该类目暂无可选产品",
    quantity: "预计数量",
    message: "留言（选填）",
    consent: "我同意按照隐私政策处理本次咨询所需的信息。",
    submit: "提交合作意向",
    sending: "正在提交…",
    success: "提交成功，我们会尽快与您联系。",
    invalid: "请填写所有必填项并同意隐私条款。",
    failed: "暂时无法提交，请稍后重试或通过邮件联系我们。"
  },
  en: {
    title: "Tell us about your project",
    introBefore: "We will get in touch shortly. Fields marked ",
    introAfter: " are required.",
    name: "Name",
    company: "Company",
    country: "Country / region code",
    optional: " (optional)",
    email: "Email",
    phone: "Phone / WhatsApp",
    category: "Product category",
    product: "Products of interest (optional)",
    chooseProduct: "Choose products",
    selectedProducts: (count: number) => `${count} products selected`,
    noProducts: "No products in this category",
    quantity: "Estimated quantity",
    message: "Message (optional)",
    consent: "I agree to the processing of information needed to respond to this inquiry.",
    submit: "Submit inquiry",
    sending: "Submitting…",
    success: "Thank you. We will contact you shortly.",
    invalid: "Complete the required fields and accept the privacy terms.",
    failed: "Submission is temporarily unavailable. Please try again later."
  },
  ar: {
    title: "أخبرنا عن احتياجات التعاون",
    introBefore: "سنتواصل معك قريبًا. الحقول المميزة بـ ",
    introAfter: " مطلوبة.",
    name: "الاسم",
    company: "الشركة",
    country: "رمز الدولة / المنطقة",
    optional: " (اختياري)",
    email: "البريد الإلكتروني",
    phone: "الهاتف / واتساب",
    category: "فئة المنتج",
    product: "المنتجات المطلوبة (اختياري)",
    chooseProduct: "اختر المنتجات",
    selectedProducts: (count: number) => `تم اختيار ${count} منتجات`,
    noProducts: "لا توجد منتجات في هذه الفئة",
    quantity: "الكمية المتوقعة",
    message: "الرسالة (اختياري)",
    consent: "أوافق على معالجة المعلومات اللازمة للرد على هذا الاستفسار.",
    submit: "إرسال طلب التعاون",
    sending: "جارٍ الإرسال…",
    success: "تم الإرسال. سنتواصل معك قريبًا.",
    invalid: "أكمل الحقول المطلوبة ووافق على شروط الخصوصية.",
    failed: "يتعذر الإرسال مؤقتًا. يرجى المحاولة لاحقًا."
  }
} as const;

export function InquiryForm({
  categories,
  locale,
  products,
  countryOptions,
  fetcher = fetch
}: {
  categories?: readonly ProductCategoryV1[];
  locale: Locale;
  products?: ProductRecord[];
  countryOptions?: CountryOption[];
  fetcher?: Fetcher;
}) {
  const labels = formCopy[locale];
  const resolvedCountryOptions = countryOptions ?? defaultCountryOptionsV1(locale);
  const resolvedProducts = products ?? sampleProducts;
  const resolvedCategories = categories ?? getSectionConfigV1(defaultSiteContentConfigV1, "products").categories;
  const enabledCategories = useMemo(
    () => resolvedCategories.filter((item) => item.enabled)
      .toSorted((left, right) => left.sortOrder - right.sortOrder || left.slug.localeCompare(right.slug)),
    [resolvedCategories]
  );
  const [categoryId, setCategoryId] = useState(() => enabledCategories[0]?.id ?? "");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? "" : "development-bypass");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "invalid" | "failed">("idle");
  const activeCategoryId = enabledCategories.some((category) => category.id === categoryId)
    ? categoryId
    : enabledCategories[0]?.id ?? "";
  const selectedCategory = enabledCategories.find((item) => item.id === activeCategoryId);
  const isCustomDevelopment = selectedCategory?.slug === "custom-development";

  useEffect(() => {
    function selectProduct(event: Event) {
      const detail = (event as CustomEvent<{ categoryId: string; categorySlug: string; productId: string }>).detail;
      const category = enabledCategories.find((item) => item.id === detail.categoryId && item.slug === detail.categorySlug);
      if (!category) return;
      const product = resolvedProducts.find((item) => item.id === detail.productId && item.categoryId === category.id);
      setCategoryId(detail.categoryId);
      setSelectedProductId(product?.id ?? null);
      setProductPickerOpen(false);
    }
    window.addEventListener("select-inquiry-product", selectProduct);
    return () => window.removeEventListener("select-inquiry-product", selectProduct);
  }, [enabledCategories, resolvedProducts]);

  const categoryProducts = useMemo(
    () => resolvedProducts.filter((product) => product.categoryId === activeCategoryId),
    [activeCategoryId, resolvedProducts],
  );
  const selectedProduct = selectedProductId
    ? resolvedProducts.find((item) => item.id === selectedProductId && item.categoryId === activeCategoryId)
    : undefined;

  function toggleProduct(productId: string) {
    setSelectedProductId((current) => current === productId ? null : productId);
  }

  useEffect(() => {
    window.shuangfuTurnstileSuccess = (token: string) => setTurnstileToken(token);
    return () => { delete window.shuangfuTurnstileSuccess; };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      setStatus("invalid");
      return;
    }
    const values = new FormData(form);
    if (values.get("privacyConsent") !== "on") {
      setStatus("invalid");
      return;
    }
    setStatus("sending");
    const body = Object.fromEntries(values.entries());
    try {
      const response = await fetcher("/api/inquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...body,
          privacyConsent: true,
          productId: selectedProduct?.id ?? null,
          locale,
          turnstileToken: body.turnstileToken || "development-bypass"
        })
      });
      if (!response.ok) throw new Error("request failed");
      form.reset();
      setSelectedProductId(null);
      setStatus("success");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <form className="inquiry-form" noValidate onSubmit={submit}>
      <header><p className="eyebrow">INQUIRY</p><h2>{labels.title}</h2><p>{labels.introBefore}<RequiredMark />{labels.introAfter}</p></header>
      <div className="form-grid">
        <Field label={labels.name} name="name" required />
        <Field label={labels.company} name="company" required />
        <label><FieldLabel label={labels.country} required />
          <SelectControl aria-label={labels.country} defaultValue={locale === "ar" ? "AE" : locale === "zh" ? "CN" : "US"} name="countryCode" required>
            {resolvedCountryOptions.map(({ code, name }) => <option key={code} value={code}>{code} · {name}</option>)}
          </SelectControl>
        </label>
        <Field dir="ltr" label={labels.email} name="email" required type="email" />
        <Field dir="ltr" label={labels.phone} name="phoneWhatsApp" required />
        <label><FieldLabel label={labels.category} required />
          <SelectControl aria-label={labels.category} name="categoryId" onChange={(event) => { setCategoryId(event.target.value); setSelectedProductId(null); setProductPickerOpen(false); }} required value={activeCategoryId}>
            {enabledCategories.map((category) => <option key={category.id} value={category.id}>{category.translations[locale].name}</option>)}
          </SelectControl>
        </label>
        <div className="product-multiselect">
          <span>{labels.product}</span>
          <button aria-expanded={productPickerOpen} className="product-picker-trigger" disabled={isCustomDevelopment} onClick={() => setProductPickerOpen((open) => !open)} type="button">
            {selectedProductId ? labels.selectedProducts(1) : labels.chooseProduct}
            <ChevronDown aria-hidden />
          </button>
          {productPickerOpen ? <div className="product-picker-menu">
            {categoryProducts.length ? categoryProducts.map((product) => {
              const content = product.translations[locale];
              const image = product.images.toSorted((a, b) => a.sortOrder - b.sortOrder)[0];
              const code = product.specifications.toSorted((a, b) => a.sortOrder - b.sortOrder)[0]?.value[locale] ?? product.id;
              return <label className="product-picker-option" key={product.id}>
                <input aria-label={`${content.name} ${code}`} checked={selectedProductId === product.id} onChange={() => toggleProduct(product.id)} type="checkbox" />
                {image ? <Image alt={content.name} height={52} src={image.url} unoptimized width={52} /> : null}
                <span><strong>{content.name}</strong><small dir="ltr">{code}</small></span>
                {selectedProductId === product.id ? <Check aria-hidden /> : null}
              </label>;
            }) : <p>{labels.noProducts}</p>}
          </div> : null}
          {selectedProductId ? <div className="selected-product-chips">
            <span>{selectedProduct?.translations[locale].name ?? selectedProductId}<button aria-label={`Remove ${selectedProduct?.translations[locale].name ?? selectedProductId}`} onClick={() => setSelectedProductId(null)} type="button">×</button></span>
          </div> : null}
        </div>
        <Field label={`${labels.quantity}${isCustomDevelopment ? labels.optional : ""}`} name="estimatedQuantity" required={!isCustomDevelopment} />
        <label className="form-span">{labels.message}<textarea maxLength={3000} name="message" rows={5} /></label>
      </div>
      <input aria-hidden className="honeypot" name="website" tabIndex={-1} />
      {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? <><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="lazyOnload"/><div className="cf-turnstile" data-callback="shuangfuTurnstileSuccess" data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}/></> : null}
      <input name="turnstileToken" type="hidden" value={turnstileToken} />
      <label className="consent"><input name="privacyConsent" required type="checkbox" /> <span>{labels.consent}</span></label>
      {status !== "idle" && status !== "sending" ? <p aria-live="polite" className={`form-status ${status}`}>{labels[status]}</p> : null}
      <button className="button button-primary" disabled={status === "sending"} type="submit">{status === "sending" ? labels.sending : labels.submit}</button>
    </form>
  );
}

declare global { interface Window { shuangfuTurnstileSuccess?: (token: string) => void } }

function Field({ label, name, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  return <label><FieldLabel label={label} required={props.required} /><input name={name} {...props} /></label>;
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return <span className="field-label">{label}{required ? <> <RequiredMark /></> : null}</span>;
}

function RequiredMark() {
  return <span className="required-mark">*</span>;
}

function SelectControl({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <span className="select-control"><select {...props}>{children}</select><ChevronDown aria-hidden /></span>;
}

function defaultCountryOptionsV1(locale: Locale): CountryOption[] {
  const displayNames = new Intl.DisplayNames([locale], { type: "region" });
  return ["CN", "US", "GB", "DE", "FR", "AE", "SA", "EG"].map((code) => ({
    code,
    name: displayNames.of(code) ?? code
  }));
}
