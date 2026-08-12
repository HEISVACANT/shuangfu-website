import { useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, Trash2 } from "lucide-react";

import {
  advantageIconKeysV1,
  getSectionConfigV1,
  type MissingContentFieldV1,
  type ProductCategoryV1,
  type SiteContentConfigV1
} from "@/lib/site-content-config-v1";
import type { Locale } from "@/lib/i18n";
import styles from "@/components/admin/page-content-editor-v1.module.css";

type ChangeConfigV1 = (mutator: (next: SiteContentConfigV1) => void) => void;

export function ProductCategoryEditorV1({ config, fieldErrors, locale, onChange }: CollectionPropsV1) {
  const categories = getSectionConfigV1(config, "products").categories;
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const groupInvalid = fieldErrors.some((error) => error.section === "products" && error.field === "categories");
  const groupErrorId = "page-content-products-categories-error";

  function addCategory() {
    const id = createUuidV4();
    const token = id.replaceAll("-", "");
    onChange((next) => {
      const items = getSectionConfigV1(next, "products").categories;
      items.push({
        id,
        slug: `category-${token}`,
        enabled: true,
        sortOrder: items.length,
        productReferenceCount: 0,
        translations: {
          zh: { name: "", description: "" },
          en: { name: "", description: "" },
          ar: { name: "", description: "" }
        }
      });
    });
  }

  return (
    <fieldset
      aria-describedby={groupInvalid ? groupErrorId : undefined}
      aria-invalid={groupInvalid || undefined}
      aria-label="产品分类"
      className={styles.collection}
      data-field-path="products.categories"
      data-testid="product-categories-group"
      tabIndex={-1}
    >
      <header><div><h3>产品分类</h3><p>分类 slug 新建后保持稳定；已关联产品的分类只能停用。</p></div><button onClick={addCategory} type="button">新增分类</button></header>
      {groupInvalid ? <p id={groupErrorId} role="alert">请至少保留一个启用分类。</p> : null}
      <div className={styles.cardList}>
        {categories.map((category, index) => {
          const prefix = `categories.${index}.translations`;
          const missingLocales = categoryMissingLocalesV1(category);
          return (
            <article
              className={styles.itemCard}
              data-testid={`product-category-${category.id}`}
              draggable
              key={category.id}
              onDragOver={(event) => event.preventDefault()}
              onDragStart={() => setDraggedId(category.id)}
              onDrop={() => {
                if (draggedId) reorderCollectionV1(onChange, "products", draggedId, category.id);
                setDraggedId(null);
              }}
            >
              <header>
                <GripVertical aria-hidden="true" />
                <div><strong>{category.translations[locale].name || "未命名分类"}</strong><small data-testid="category-slug">{category.slug}</small><span className={missingLocales === 0 ? styles.completeBadge : styles.incompleteBadge}>{missingLocales === 0 ? "三语完整" : `缺失 ${missingLocales} 种语言`}</span></div>
                <label className={styles.switchLabel}><input aria-label="启用分类" checked={category.enabled} onChange={(event) => onChange((next) => { getSectionConfigV1(next, "products").categories[index].enabled = event.target.checked; })} type="checkbox" />启用</label>
                <OrderButtonsV1 index={index} length={categories.length} label="分类" onMove={(offset) => moveCollectionV1(onChange, "products", index, offset)} />
              </header>
              <div className={styles.itemFields}>
                <ControlledFieldV1 label="分类名称" path={`products.${locale}.${prefix}.name`} value={category.translations[locale].name} invalid={hasErrorV1(fieldErrors, "products", locale, `${prefix}.name`)} onChange={(value) => onChange((next) => { getSectionConfigV1(next, "products").categories[index].translations[locale].name = value; })} />
                <ControlledFieldV1 multiline label="分类介绍" path={`products.${locale}.${prefix}.description`} value={category.translations[locale].description} invalid={hasErrorV1(fieldErrors, "products", locale, `${prefix}.description`)} onChange={(value) => onChange((next) => { getSectionConfigV1(next, "products").categories[index].translations[locale].description = value; })} />
              </div>
              <footer>
                {category.productReferenceCount > 0 ? <p>已关联 {category.productReferenceCount} 个产品，请先迁移产品后再删除。</p> : <p>无关联产品，可永久删除。</p>}
                <button
                  aria-label="删除分类"
                  disabled={category.productReferenceCount > 0}
                  onClick={() => {
                    if (!window.confirm("确定永久删除该分类吗？")) return;
                    onChange((next) => {
                      const items = getSectionConfigV1(next, "products").categories;
                      items.splice(index, 1);
                      rewriteSortOrderV1(items);
                    });
                  }}
                  type="button"
                ><Trash2 aria-hidden="true" />删除分类</button>
              </footer>
            </article>
          );
        })}
      </div>
    </fieldset>
  );
}

export function AdvantageStepsEditorV1({ config, fieldErrors, locale, onChange }: CollectionPropsV1) {
  const steps = getSectionConfigV1(config, "advantages").steps;
  const [draggedId, setDraggedId] = useState<string | null>(null);

  function addStep() {
    if (steps.length >= 8) return;
    const id = crypto.randomUUID();
    onChange((next) => {
      const items = getSectionConfigV1(next, "advantages").steps;
      items.push({
        id,
        sortOrder: items.length,
        icon: "layers",
        title: { zh: "", en: "", ar: "" },
        text: { zh: "", en: "", ar: "" }
      });
    });
  }

  return (
    <section className={styles.collection}>
      <header><div><h3>优势步骤</h3><p>最少 1 项，最多 8 项，图标限定为内置 Lucide 图标。</p></div><button disabled={steps.length >= 8} onClick={addStep} type="button">新增优势步骤</button></header>
      <div className={styles.cardList}>
        {steps.map((step, index) => {
          return (
            <article
              className={styles.itemCard}
              data-testid={`advantage-step-${step.id}`}
              draggable
              key={step.id}
              onDragOver={(event) => event.preventDefault()}
              onDragStart={() => setDraggedId(step.id)}
              onDrop={() => {
                if (draggedId) reorderCollectionV1(onChange, "advantages", draggedId, step.id);
                setDraggedId(null);
              }}
            >
              <header>
                <GripVertical aria-hidden="true" />
                <strong>步骤 {index + 1}</strong>
                <label className={styles.iconSelect}>步骤图标<select aria-label="步骤图标" value={step.icon} onChange={(event) => onChange((next) => { getSectionConfigV1(next, "advantages").steps[index].icon = event.target.value as typeof step.icon; })}>{advantageIconKeysV1.map((icon) => <option key={icon} value={icon}>{icon}</option>)}</select></label>
                <OrderButtonsV1 index={index} length={steps.length} label="优势步骤" onMove={(offset) => moveCollectionV1(onChange, "advantages", index, offset)} />
              </header>
              <div className={styles.itemFields}>
                <ControlledFieldV1 label="步骤标题" path={`advantages.${locale}.steps.${index}.title`} value={step.title[locale]} invalid={hasErrorV1(fieldErrors, "advantages", locale, `steps.${index}.title`)} onChange={(value) => onChange((next) => { getSectionConfigV1(next, "advantages").steps[index].title[locale] = value; })} />
                <ControlledFieldV1 multiline label="步骤说明" path={`advantages.${locale}.steps.${index}.text`} value={step.text[locale]} invalid={hasErrorV1(fieldErrors, "advantages", locale, `steps.${index}.text`)} onChange={(value) => onChange((next) => { getSectionConfigV1(next, "advantages").steps[index].text[locale] = value; })} />
              </div>
              <footer><span /><button aria-label="删除优势步骤" disabled={steps.length <= 1} onClick={() => onChange((next) => { const items = getSectionConfigV1(next, "advantages").steps; items.splice(index, 1); rewriteSortOrderV1(items); })} type="button"><Trash2 aria-hidden="true" />删除步骤</button></footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function OrderButtonsV1({ index, label, length, onMove }: { index: number; label: string; length: number; onMove: (offset: -1 | 1) => void }) {
  return <span className={styles.orderButtons}><button aria-label={`上移${label}`} disabled={index === 0} onClick={() => onMove(-1)} type="button"><ChevronUp aria-hidden="true" /></button><button aria-label={`下移${label}`} disabled={index === length - 1} onClick={() => onMove(1)} type="button"><ChevronDown aria-hidden="true" /></button></span>;
}

function ControlledFieldV1({ invalid, label, multiline, onChange, path, value }: {
  invalid: boolean;
  label: string;
  multiline?: boolean;
  onChange: (value: string) => void;
  path: string;
  value: string;
}) {
  const id = `page-content-${path.replaceAll(".", "-")}`;
  const errorId = `${id}-error`;
  const common = { "aria-describedby": invalid ? errorId : undefined, "aria-invalid": invalid || undefined, "data-field-path": path, dir: path.includes(".ar.") ? "rtl" : "ltr", id, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value), value };
  return <div className={styles.field}><label htmlFor={id}>{label}</label>{multiline ? <textarea {...common} /> : <input {...common} />}{invalid ? <small id={errorId} role="alert">此字段需要补全。</small> : null}</div>;
}

function moveCollectionV1(onChange: ChangeConfigV1, section: "products" | "advantages", index: number, offset: -1 | 1) {
  onChange((next) => {
    const items = section === "products" ? getSectionConfigV1(next, section).categories : getSectionConfigV1(next, section).steps;
    const target = index + offset;
    if (target < 0 || target >= items.length) return;
    const [item] = items.splice(index, 1);
    items.splice(target, 0, item as never);
    rewriteSortOrderV1(items);
  });
}

function reorderCollectionV1(onChange: ChangeConfigV1, section: "products" | "advantages", draggedId: string, targetId: string) {
  if (draggedId === targetId) return;
  onChange((next) => {
    const items = section === "products" ? getSectionConfigV1(next, section).categories : getSectionConfigV1(next, section).steps;
    const from = items.findIndex((item) => item.id === draggedId);
    const target = items.findIndex((item) => item.id === targetId);
    if (from < 0 || target < 0) return;
    const [item] = items.splice(from, 1);
    items.splice(target, 0, item as never);
    rewriteSortOrderV1(items);
  });
}

function rewriteSortOrderV1(items: Array<{ sortOrder: number }>) {
  items.forEach((item, index) => { item.sortOrder = index; });
}

function hasErrorV1(errors: MissingContentFieldV1[], section: "products" | "advantages", locale: Locale, field: string) {
  return errors.some((error) => error.section === section && error.locale === locale && error.field === field);
}

function createUuidV4() {
  return globalThis.crypto.randomUUID();
}

function categoryMissingLocalesV1(category: ProductCategoryV1) {
  return (["zh", "en", "ar"] as const).filter((locale) => {
    const translation = category.translations[locale];
    return !translation.name.trim() || !translation.description.trim();
  }).length;
}

interface CollectionPropsV1 {
  config: SiteContentConfigV1;
  fieldErrors: MissingContentFieldV1[];
  locale: Locale;
  onChange: ChangeConfigV1;
}
