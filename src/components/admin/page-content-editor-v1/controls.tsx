import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";

import type { SaveSiteContentStateV1 } from "@/app/admin/actions";
import type { MissingContentFieldV1, SiteContentConfigV1, SiteSectionKeyV1, SiteSectionV1 } from "@/lib/site-content-config-v1";
import type { Locale } from "@/lib/i18n";
import styles from "@/components/admin/page-content-editor-v1.module.css";

const sectionNamesV1: Record<SiteSectionKeyV1, string> = {
  home: "首页",
  about: "企业介绍",
  products: "产品介绍",
  advantages: "合作优势",
  contact: "联系我们"
};

const localeLabelsV1: Record<Locale, string> = {
  zh: "中文",
  en: "English",
  ar: "العربية"
};

export function SectionNavigatorV1({
  activeKey,
  sections,
  onDragStart,
  onDrop,
  onMove,
  onSelect
}: {
  activeKey: SiteSectionKeyV1;
  sections: SiteSectionV1[];
  onDragStart: (key: SiteSectionKeyV1) => void;
  onDrop: (key: SiteSectionKeyV1) => void;
  onMove: (key: SiteSectionKeyV1, offset: -1 | 1) => void;
  onSelect: (key: SiteSectionKeyV1) => void;
}) {
  return (
    <aside className={styles.navigator} aria-label="板块导航与排序">
      <h2>官网板块</h2>
      <p>拖拽或使用箭头调整展示顺序。</p>
      <ol>
        {sections.map((section, index) => (
          <li
            data-testid="page-content-section"
            draggable
            key={section.key}
            onDragOver={(event) => event.preventDefault()}
            onDragStart={() => onDragStart(section.key)}
            onDrop={() => onDrop(section.key)}
          >
            <GripVertical aria-hidden="true" />
            <button
              aria-current={activeKey === section.key ? "page" : undefined}
              className={activeKey === section.key ? styles.activeSection : undefined}
              onClick={() => onSelect(section.key)}
              type="button"
              aria-label={`编辑 ${sectionNamesV1[section.key]}`}
            >
              <strong>{sectionNamesV1[section.key]}</strong>
              <small>版式 {layoutLetterV1(section.layout, section.key)} · 已启用</small>
            </button>
            <span className={styles.orderButtons}>
              <button
                aria-label={`上移 ${sectionNamesV1[section.key]}`}
                disabled={index === 0}
                onClick={() => onMove(section.key, -1)}
                type="button"
              ><ChevronUp aria-hidden="true" /></button>
              <button
                aria-label={`下移 ${sectionNamesV1[section.key]}`}
                disabled={index === sections.length - 1}
                onClick={() => onMove(section.key, 1)}
                type="button"
              ><ChevronDown aria-hidden="true" /></button>
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

export function LocaleTabsV1({
  activeLocale,
  config,
  fieldErrors,
  onSelect
}: {
  activeLocale: Locale;
  config: SiteContentConfigV1;
  fieldErrors: MissingContentFieldV1[];
  onSelect: (locale: Locale) => void;
}) {
  return (
    <div className={styles.localeTabs} role="tablist" aria-label="内容语言">
      {(Object.keys(localeLabelsV1) as Locale[]).map((locale) => {
        const missing = fieldErrors.filter((error) => error.locale === locale).length;
        return (
          <button
            aria-controls="page-content-locale-panel"
            aria-label={localeLabelsV1[locale]}
            aria-selected={activeLocale === locale}
            id={`page-content-tab-${locale}`}
            key={locale}
            onClick={() => onSelect(locale)}
            role="tab"
            type="button"
          >
            {localeLabelsV1[locale]}
            {missing > 0 ? <span aria-label={`${missing} 个待补字段`}>{missing}</span> : null}
          </button>
        );
      })}
      <span className={styles.localeSummary} aria-hidden="true">{config.sections.length} 个板块</span>
    </div>
  );
}

export function LayoutPickerV1({
  labels,
  value,
  onChange
}: {
  labels: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className={styles.layoutPicker}>
      <legend>板块版式</legend>
      {labels.map((option) => (
        <label key={option.value}>
          <input
            checked={value === option.value}
            name="section-layout"
            onChange={() => onChange(option.value)}
            type="radio"
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function EditorActionBarV1({ actionState, dirty, pending, previewMessage, onPreview }: {
  actionState: SaveSiteContentStateV1;
  dirty: boolean;
  pending: boolean;
  previewMessage: string;
  onPreview: () => void;
}) {
  return (
    <footer className={styles.actionBar}>
      <div aria-live="polite">
        <strong className={dirty ? styles.dirty : styles.saved}>{dirty ? "有未保存更改" : "已保存"}</strong>
        {actionState.message ? (
          <span className={actionState.ok ? styles.success : styles.error}>{actionState.message}</span>
        ) : null}
        {actionState.ok && actionState.savedAt ? (
          <time dateTime={actionState.savedAt}>{formatSavedAtV1(actionState.savedAt)}</time>
        ) : null}
        {previewMessage ? <span className={styles.error}>{previewMessage}</span> : null}
      </div>
      <div>
        <button data-testid="page-content-preview-trigger" onClick={onPreview} type="button">预览效果</button>
        <button className={styles.primary} disabled={pending} type="submit">
          {pending ? "保存中…" : "保存并立即生效"}
        </button>
      </div>
    </footer>
  );
}

function layoutLetterV1(layout: string, key: SiteSectionKeyV1) {
  const layouts: Record<SiteSectionKeyV1, readonly string[]> = {
    home: ["text-left", "image-left", "centered"],
    about: ["text-left", "image-left", "stacked"],
    products: ["tabs-grid", "accordion", "featured-grid"],
    advantages: ["cards", "two-column", "timeline"],
    contact: ["info-left", "form-left", "stacked"]
  };
  return String.fromCharCode(65 + Math.max(0, layouts[key].indexOf(layout)));
}

function formatSavedAtV1(value: string) {
  return `${new Date(value).toISOString().slice(0, 19).replace("T", " ")} UTC`;
}
