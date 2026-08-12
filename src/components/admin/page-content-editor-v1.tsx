"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import {
  saveSiteContentV1,
  type SaveSiteContentStateV1
} from "@/app/admin/actions";
import { openOneTimePreviewChannelV1 } from "@/components/admin/page-content-preview-v1";
import { EditorActionBarV1, LocaleTabsV1, SectionNavigatorV1 } from "@/components/admin/page-content-editor-v1/controls";
import { SectionFormV1 } from "@/components/admin/page-content-editor-v1/section-forms";
import type { MediaRecord } from "@/components/admin/media-upload";
import {
  getSectionConfigV1,
  sectionKeysV1,
  siteContentConfigSchemaV1,
  type MissingContentFieldV1,
  type SiteContentConfigV1,
  type SiteSectionKeyV1,
  validateSiteContentForSave
} from "@/lib/site-content-config-v1";
import type { SiteContentBaselineV1 } from "@/lib/site-content-repository-v1";
import { locales, type Locale } from "@/lib/i18n";
import styles from "@/components/admin/page-content-editor-v1.module.css";

export interface PageContentEditorV1Props {
  initialConfig: SiteContentConfigV1;
  baseline: SiteContentBaselineV1;
  media: MediaRecord[];
}

const initialActionStateV1: SaveSiteContentStateV1 = {
  ok: false,
  code: "DATABASE_ERROR",
  message: "",
  fieldErrors: [],
  savedAt: null
};

export function PageContentEditorV1({ initialConfig, baseline, media }: PageContentEditorV1Props) {
  const [config, setConfig] = useState(() => structuredClone(initialConfig));
  const [currentBaseline, setCurrentBaseline] = useState(() => structuredClone(baseline));
  const [mediaRecords, setMediaRecords] = useState(() => structuredClone(media));
  const [activeSection, setActiveSection] = useState<SiteSectionKeyV1>("home");
  const [activeLocale, setActiveLocale] = useState<Locale>("zh");
  const [dirty, setDirty] = useState(false);
  const [revision, setRevision] = useState(0);
  const [submittedRevision, setSubmittedRevision] = useState<number | null>(null);
  const [draggedSection, setDraggedSection] = useState<SiteSectionKeyV1 | null>(null);
  const [previewMessage, setPreviewMessage] = useState("");
  const [actionState, formAction, pending] = useActionState(saveSiteContentV1, initialActionStateV1);
  const [observedActionResponse, setObservedActionResponse] = useState(() => ({
    state: actionState,
    revision: null as number | null
  }));
  const handledSuccessRef = useRef<SaveSiteContentStateV1 | null>(null);
  const revisionRef = useRef(0);
  const actionStateChanged = observedActionResponse.state !== actionState;
  const responseRevision = actionStateChanged
    ? submittedRevision
    : observedActionResponse.revision;
  if (actionStateChanged) {
    setObservedActionResponse({ state: actionState, revision: submittedRevision });
  }

  function changeConfig(mutator: (next: SiteContentConfigV1) => void) {
    revisionRef.current += 1;
    setRevision((current) => current + 1);
    setConfig((current) => {
      const next = structuredClone(current);
      mutator(next);
      return next;
    });
    setDirty(true);
  }

  function moveSection(key: SiteSectionKeyV1, offset: -1 | 1) {
    changeConfig((next) => {
      const index = next.sections.findIndex((section) => section.key === key);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= next.sections.length) return;
      const [section] = next.sections.splice(index, 1);
      next.sections.splice(target, 0, section);
      next.sections.forEach((item, order) => { item.sortOrder = order; });
    });
  }

  function dropSection(targetKey: SiteSectionKeyV1) {
    if (!draggedSection || draggedSection === targetKey) return;
    changeConfig((next) => {
      const from = next.sections.findIndex((section) => section.key === draggedSection);
      const target = next.sections.findIndex((section) => section.key === targetKey);
      if (from < 0 || target < 0) return;
      const [section] = next.sections.splice(from, 1);
      next.sections.splice(target, 0, section);
      next.sections.forEach((item, order) => { item.sortOrder = order; });
    });
    setDraggedSection(null);
  }

  function previewCurrentConfig() {
    setPreviewMessage("");
    let closeChannel: (() => void) | undefined;
    try {
      const channelId = crypto.randomUUID();
      closeChannel = openOneTimePreviewChannelV1(channelId, config, {
        onTimeout: () => setPreviewMessage("未能连接预览标签页，请重试并确认浏览器允许弹窗。")
      });
      window.open(
        `/admin/pages/preview?channel=${encodeURIComponent(channelId)}`,
        "_blank",
        "noopener"
      );
    } catch {
      closeChannel?.();
      setPreviewMessage("当前内容结构不完整，暂时无法预览。");
    }
  }

  useEffect(() => {
    if (!dirty) return;
    const protectUnsavedChanges = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectUnsavedChanges);
    return () => window.removeEventListener("beforeunload", protectUnsavedChanges);
  }, [dirty]);

  useEffect(() => {
    if (!actionState.ok || !actionState.savedAt || handledSuccessRef.current === actionState) return;
    handledSuccessRef.current = actionState;
    const savedAt = actionState.savedAt;
    const savedRevision = responseRevision;
    const timer = window.setTimeout(() => {
      setCurrentBaseline({
        sections: sectionKeysV1.map((key) => ({ key, updatedAt: savedAt }))
      });
      if (revisionRef.current === savedRevision) setDirty(false);
    });
    return () => window.clearTimeout(timer);
  }, [actionState, responseRevision]);

  useEffect(() => {
    if (
      actionState.code !== "VALIDATION_ERROR"
      || responseRevision !== revision
    ) return;
    const firstError = actionState.fieldErrors[0];
    if (!firstError) return;
    const timer = window.setTimeout(() => {
      setActiveSection(firstError.section);
      if (firstError.locale) setActiveLocale(firstError.locale);
      window.setTimeout(() => {
        findFieldByPathV1(fieldPathV1(firstError))?.focus();
      });
    });
    return () => window.clearTimeout(timer);
  }, [actionState, responseRevision, revision]);

  const active = config.sections.find((section) => section.key === activeSection) ?? config.sections[0];
  const localFieldErrors = collectEditorFieldErrorsV1(config);
  const actionFieldErrors = actionState.code === "VALIDATION_ERROR"
    && responseRevision === revision
    ? actionState.fieldErrors
    : [];
  const fieldErrors = mergeFieldErrorsV1(localFieldErrors, actionFieldErrors);
  const visibleActionState = actionState.code === "VALIDATION_ERROR"
    && responseRevision !== revision
    ? { ...actionState, message: "", fieldErrors: [] }
    : actionState;

  return (
    <form
      action={formAction}
      className={styles.editor}
      onSubmit={(event) => {
        const firstError = localFieldErrors[0];
        if (firstError) {
          event.preventDefault();
          focusFieldErrorV1(firstError, setActiveSection, setActiveLocale);
          return;
        }
        setSubmittedRevision(revisionRef.current);
      }}
    >
      <input name="payload" type="hidden" value={JSON.stringify(config)} />
      <input name="baseline" type="hidden" value={JSON.stringify(currentBaseline)} />
      <div className={styles.workspace}>
        <SectionNavigatorV1
          activeKey={active.key}
          sections={config.sections}
          onDragStart={setDraggedSection}
          onDrop={dropSection}
          onMove={moveSection}
          onSelect={setActiveSection}
        />
        <main className={styles.content}>
          <header className={styles.header}>
            <div>
              <p>PAGE CONTENT</p>
              <h1>{sectionTitleV1[active.key]}</h1>
              <span>五个官网板块始终启用，可维护三语内容、顺序与版式。</span>
            </div>
            <span className={styles.fixedBadge}>固定板块 · 已启用</span>
          </header>
          <LocaleTabsV1
            activeLocale={activeLocale}
            config={config}
            fieldErrors={fieldErrors}
            onSelect={setActiveLocale}
          />
          <SectionFormV1
            config={config}
            fieldErrors={fieldErrors}
            locale={activeLocale}
            media={mediaRecords}
            sectionKey={active.key}
            onChange={changeConfig}
            onUploaded={(record) => {
              setMediaRecords((current) => current.some((item) => item.id === record.id)
                ? current
                : [record, ...current]);
            }}
          />
        </main>
      </div>
      <EditorActionBarV1
        actionState={visibleActionState}
        dirty={dirty}
        onPreview={previewCurrentConfig}
        pending={pending}
        previewMessage={previewMessage}
      />
    </form>
  );
}

const sectionTitleV1: Record<SiteSectionKeyV1, string> = {
  home: "首页",
  about: "企业介绍",
  products: "产品介绍",
  advantages: "合作优势",
  contact: "联系我们"
};

function fieldPathV1(error: MissingContentFieldV1) {
  const locale = error.locale ? `.${error.locale}` : "";
  return `${error.section}${locale}.${error.field}`;
}

function findFieldByPathV1(path: string) {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-field-path]"))
    .find((element) => element.dataset.fieldPath === path);
}

function focusFieldErrorV1(
  error: MissingContentFieldV1,
  setSection: (section: SiteSectionKeyV1) => void,
  setLocale: (locale: Locale) => void
) {
  setSection(error.section);
  if (error.locale) setLocale(error.locale);
  window.setTimeout(() => findFieldByPathV1(fieldPathV1(error))?.focus());
}

function mergeFieldErrorsV1(...groups: MissingContentFieldV1[][]) {
  const seen = new Set<string>();
  return groups.flat().filter((error) => {
    const key = `${error.section}:${error.locale ?? "shared"}:${error.field}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectEditorFieldErrorsV1(config: SiteContentConfigV1): MissingContentFieldV1[] {
  const parsed = siteContentConfigSchemaV1.safeParse(config);
  if (parsed.success) return validateSiteContentForSave(parsed.data);

  const schemaErrors = parsed.error.issues.flatMap((issue): MissingContentFieldV1[] => {
    const mapped = mapIssuePathV1(config, issue.path);
    return mapped ? [mapped] : [];
  });
  const normalized = normalizeFormatInvalidFieldsV1(config, parsed.error.issues.map((issue) => issue.path));
  const normalizedParsed = siteContentConfigSchemaV1.safeParse(normalized);
  const requiredErrors = normalizedParsed.success
    ? validateSiteContentForSave(normalizedParsed.data)
    : [];
  return mergeFieldErrorsV1(schemaErrors, requiredErrors);
}

function normalizeFormatInvalidFieldsV1(config: SiteContentConfigV1, issuePaths: PropertyKey[][]) {
  const normalized = structuredClone(config);
  const contactIndex = config.sections.findIndex((section) => section.key === "contact");
  const hasInvalidEmail = issuePaths.some((path) => (
    path[0] === "sections"
    && path[1] === contactIndex
    && path[2] === "shared"
    && path[3] === "email"
  ));
  if (hasInvalidEmail) getSectionConfigV1(normalized, "contact").shared.email = "";
  return normalized;
}

function mapIssuePathV1(
  config: SiteContentConfigV1,
  path: PropertyKey[]
): MissingContentFieldV1 | null {
  if (path[0] !== "sections" || typeof path[1] !== "number") return null;
  const section = config.sections[path[1]];
  if (!section) return null;
  const rest = path.slice(2);

  if (rest[0] === "content" && isLocaleV1(rest[1])) {
    return fieldErrorV1(section.key, rest[1], rest.slice(2));
  }
  if (rest[0] === "media" && rest[1] === "alt" && isLocaleV1(rest[2])) {
    return { section: section.key, locale: rest[2], field: "media.alt" };
  }
  if (rest[0] === "categories") {
    if (typeof rest[1] === "number" && rest[2] === "translations" && isLocaleV1(rest[3])) {
      return {
        section: "products",
        locale: rest[3],
        field: `categories.${rest[1]}.translations.${stringPathV1(rest.slice(4))}`
      };
    }
    return { section: "products", field: "categories" };
  }
  if (rest[0] === "steps") {
    if (typeof rest[1] === "number" && (rest[2] === "title" || rest[2] === "text") && isLocaleV1(rest[3])) {
      return {
        section: "advantages",
        locale: rest[3],
        field: `steps.${rest[1]}.${rest[2]}`
      };
    }
    return { section: "advantages", field: "steps" };
  }
  return fieldErrorV1(section.key, undefined, rest);
}

function fieldErrorV1(
  section: SiteSectionKeyV1,
  locale: Locale | undefined,
  path: PropertyKey[]
): MissingContentFieldV1 | null {
  const field = stringPathV1(path);
  return field ? { section, ...(locale ? { locale } : {}), field } : null;
}

function stringPathV1(path: PropertyKey[]) {
  return path
    .filter((part): part is string | number => typeof part === "string" || typeof part === "number")
    .join(".");
}

function isLocaleV1(value: PropertyKey | undefined): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
