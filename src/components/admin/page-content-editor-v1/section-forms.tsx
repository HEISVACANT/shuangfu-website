import Image from "next/image";

import { MediaUpload, type MediaRecord } from "@/components/admin/media-upload";
import { AdvantageStepsEditorV1, ProductCategoryEditorV1 } from "@/components/admin/page-content-editor-v1/collections";
import { LayoutPickerV1 } from "@/components/admin/page-content-editor-v1/controls";
import {
  getSectionConfigV1,
  type MissingContentFieldV1,
  type SiteContentConfigV1,
  type SiteSectionKeyV1
} from "@/lib/site-content-config-v1";
import type { Locale } from "@/lib/i18n";
import styles from "@/components/admin/page-content-editor-v1.module.css";

type ChangeConfigV1 = (mutator: (next: SiteContentConfigV1) => void) => void;

export function SectionFormV1({
  config,
  fieldErrors,
  locale,
  media,
  sectionKey,
  onChange,
  onUploaded
}: {
  config: SiteContentConfigV1;
  fieldErrors: MissingContentFieldV1[];
  locale: Locale;
  media: MediaRecord[];
  sectionKey: SiteSectionKeyV1;
  onChange: ChangeConfigV1;
  onUploaded: (record: MediaRecord) => void;
}) {
  const common = { config, fieldErrors, locale, onChange };
  return (
    <section
      aria-labelledby={`page-content-tab-${locale}`}
      className={styles.panel}
      data-locale={locale}
      dir="ltr"
      id="page-content-locale-panel"
      role="tabpanel"
    >
      {sectionKey === "home" ? <HomeSectionFormV1 {...common} media={media} onUploaded={onUploaded} /> : null}
      {sectionKey === "about" ? <AboutSectionFormV1 {...common} media={media} onUploaded={onUploaded} /> : null}
      {sectionKey === "products" ? <ProductsSectionFormV1 {...common} /> : null}
      {sectionKey === "advantages" ? <AdvantagesSectionFormV1 {...common} /> : null}
      {sectionKey === "contact" ? <ContactSectionFormV1 {...common} /> : null}
    </section>
  );
}

function HomeSectionFormV1({ config, fieldErrors, locale, media, onChange, onUploaded }: BaseFormPropsV1 & MediaFormPropsV1) {
  const section = getSectionConfigV1(config, "home");
  const content = section.content[locale];
  return (
    <>
      <LayoutPickerV1
        labels={[
          { value: "text-left", label: "A · 文左图右" },
          { value: "image-left", label: "B · 图左文右" },
          { value: "centered", label: "C · 居中大标题" }
        ]}
        value={section.layout}
        onChange={(layout) => onChange((next) => { getSectionConfigV1(next, "home").layout = layout as typeof section.layout; })}
      />
      <div className={styles.fieldGrid}>
        <TextFieldV1 label="首页公司短称" path={`home.${locale}.companyShort`} value={content.companyShort} invalid={invalidV1(fieldErrors, "home", locale, "companyShort")} onChange={(value) => updateLocalizedV1(onChange, "home", locale, "companyShort", value)} />
        <TextFieldV1 label="首页眉题" path={`home.${locale}.eyebrow`} value={content.eyebrow} invalid={invalidV1(fieldErrors, "home", locale, "eyebrow")} onChange={(value) => updateLocalizedV1(onChange, "home", locale, "eyebrow", value)} />
        <TextFieldV1 multiline label="首页主标题" path={`home.${locale}.title`} value={content.title} invalid={invalidV1(fieldErrors, "home", locale, "title")} onChange={(value) => updateLocalizedV1(onChange, "home", locale, "title", value)} />
        <TextFieldV1 multiline label="首页介绍" path={`home.${locale}.text`} value={content.text} invalid={invalidV1(fieldErrors, "home", locale, "text")} onChange={(value) => updateLocalizedV1(onChange, "home", locale, "text", value)} />
        <TextFieldV1 label="产品按钮文案" path={`home.${locale}.cta`} value={content.cta} invalid={invalidV1(fieldErrors, "home", locale, "cta")} onChange={(value) => updateLocalizedV1(onChange, "home", locale, "cta", value)} />
        <TextFieldV1 label="联系按钮文案" path={`home.${locale}.contactCta`} value={content.contactCta} invalid={invalidV1(fieldErrors, "home", locale, "contactCta")} onChange={(value) => updateLocalizedV1(onChange, "home", locale, "contactCta", value)} />
        <fieldset
          aria-invalid={invalidV1(fieldErrors, "home", locale, "nav") || undefined}
          className={styles.nestedFields}
          data-field-path={`home.${locale}.nav`}
          data-testid="home-nav-fields"
          tabIndex={-1}
        >
          <legend>导航文案</legend>
          {content.nav.map((value, index) => (
            <TextFieldV1 key={index} label={`导航 ${index + 1}`} path={`home.${locale}.nav.${index}`} value={value} invalid={invalidV1(fieldErrors, "home", locale, "nav")} onChange={(nextValue) => onChange((next) => { getSectionConfigV1(next, "home").content[locale].nav[index] = nextValue; })} />
          ))}
        </fieldset>
        <TextFieldV1 label="首页图片替代文本" path={`home.${locale}.media.alt`} value={section.media.alt[locale]} invalid={invalidV1(fieldErrors, "home", locale, "media.alt")} onChange={(value) => onChange((next) => { getSectionConfigV1(next, "home").media.alt[locale] = value; })} />
      </div>
      <MediaPickerV1 fieldErrors={fieldErrors} sectionKey="home" selected={section.media.image} media={media} onChange={onChange} onUploaded={onUploaded} />
    </>
  );
}

function AboutSectionFormV1({ config, fieldErrors, locale, media, onChange, onUploaded }: BaseFormPropsV1 & MediaFormPropsV1) {
  const section = getSectionConfigV1(config, "about");
  const content = section.content[locale];
  return (
    <>
      <LayoutPickerV1
        labels={[
          { value: "text-left", label: "A · 文左图右" },
          { value: "image-left", label: "B · 图左文右" },
          { value: "stacked", label: "C · 上图下文" }
        ]}
        value={section.layout}
        onChange={(layout) => onChange((next) => { getSectionConfigV1(next, "about").layout = layout as typeof section.layout; })}
      />
      <div className={styles.fieldGrid}>
        <TextFieldV1 label="企业介绍眉题" path={`about.${locale}.eyebrow`} value={content.eyebrow} invalid={invalidV1(fieldErrors, "about", locale, "eyebrow")} onChange={(value) => updateLocalizedV1(onChange, "about", locale, "eyebrow", value)} />
        <TextFieldV1 multiline label="企业介绍主标题" path={`about.${locale}.title`} value={content.title} invalid={invalidV1(fieldErrors, "about", locale, "title")} onChange={(value) => updateLocalizedV1(onChange, "about", locale, "title", value)} />
        <TextFieldV1 multiline label="企业介绍正文" path={`about.${locale}.text`} value={content.text} invalid={invalidV1(fieldErrors, "about", locale, "text")} onChange={(value) => updateLocalizedV1(onChange, "about", locale, "text", value)} />
        {section.facts.map((fact, index) => (
          <div className={styles.nestedFields} key={fact.id}>
            <strong>数据亮点 {index + 1}</strong>
            <TextFieldV1 label="亮点数值" path={`about.${locale}.facts.${index}.value`} value={fact.value[locale]} invalid={invalidV1(fieldErrors, "about", locale, `facts.${index}.value`)} onChange={(value) => onChange((next) => { getSectionConfigV1(next, "about").facts[index].value[locale] = value; })} />
            <TextFieldV1 label="亮点说明" path={`about.${locale}.facts.${index}.label`} value={fact.label[locale]} invalid={invalidV1(fieldErrors, "about", locale, `facts.${index}.label`)} onChange={(value) => onChange((next) => { getSectionConfigV1(next, "about").facts[index].label[locale] = value; })} />
          </div>
        ))}
        <TextFieldV1 label="企业介绍图片替代文本" path={`about.${locale}.media.alt`} value={section.media.alt[locale]} invalid={invalidV1(fieldErrors, "about", locale, "media.alt")} onChange={(value) => onChange((next) => { getSectionConfigV1(next, "about").media.alt[locale] = value; })} />
      </div>
      <MediaPickerV1 fieldErrors={fieldErrors} sectionKey="about" selected={section.media.image} media={media} onChange={onChange} onUploaded={onUploaded} />
    </>
  );
}

function ProductsSectionFormV1(props: BaseFormPropsV1) {
  const { config, fieldErrors, locale, onChange } = props;
  const section = getSectionConfigV1(config, "products");
  const content = section.content[locale];
  return (
    <>
      <LayoutPickerV1 labels={[
        { value: "tabs-grid", label: "A · 分类标签＋网格" },
        { value: "accordion", label: "B · 分类折叠" },
        { value: "featured-grid", label: "C · 主推＋产品网格" }
      ]} value={section.layout} onChange={(layout) => onChange((next) => { getSectionConfigV1(next, "products").layout = layout as typeof section.layout; })} />
      <div className={styles.fieldGrid}>
        <TextFieldV1 label="产品介绍眉题" path={`products.${locale}.eyebrow`} value={content.eyebrow} invalid={invalidV1(fieldErrors, "products", locale, "eyebrow")} onChange={(value) => updateLocalizedV1(onChange, "products", locale, "eyebrow", value)} />
        <TextFieldV1 multiline label="产品介绍主标题" path={`products.${locale}.title`} value={content.title} invalid={invalidV1(fieldErrors, "products", locale, "title")} onChange={(value) => updateLocalizedV1(onChange, "products", locale, "title", value)} />
        <TextFieldV1 multiline label="产品介绍正文" path={`products.${locale}.text`} value={content.text} invalid={invalidV1(fieldErrors, "products", locale, "text")} onChange={(value) => updateLocalizedV1(onChange, "products", locale, "text", value)} />
      </div>
      <ProductCategoryEditorV1 {...props} />
    </>
  );
}

function AdvantagesSectionFormV1(props: BaseFormPropsV1) {
  const { config, fieldErrors, locale, onChange } = props;
  const section = getSectionConfigV1(config, "advantages");
  const content = section.content[locale];
  return (
    <>
      <LayoutPickerV1 labels={[
        { value: "cards", label: "A · 横向卡片" },
        { value: "two-column", label: "B · 两列步骤" },
        { value: "timeline", label: "C · 垂直流程" }
      ]} value={section.layout} onChange={(layout) => onChange((next) => { getSectionConfigV1(next, "advantages").layout = layout as typeof section.layout; })} />
      <div className={styles.fieldGrid}>
        <TextFieldV1 label="合作优势眉题" path={`advantages.${locale}.eyebrow`} value={content.eyebrow} invalid={invalidV1(fieldErrors, "advantages", locale, "eyebrow")} onChange={(value) => updateAdvantagesContentV1(onChange, locale, "eyebrow", value)} />
        <TextFieldV1 multiline label="合作优势主标题" path={`advantages.${locale}.title`} value={content.title} invalid={invalidV1(fieldErrors, "advantages", locale, "title")} onChange={(value) => updateAdvantagesContentV1(onChange, locale, "title", value)} />
        <TextFieldV1 multiline label="合作优势介绍" path={`advantages.${locale}.description`} value={content.description} invalid={invalidV1(fieldErrors, "advantages", locale, "description")} onChange={(value) => updateAdvantagesContentV1(onChange, locale, "description", value)} />
      </div>
      <AdvantageStepsEditorV1 {...props} />
    </>
  );
}

function ContactSectionFormV1({ config, fieldErrors, locale, onChange }: BaseFormPropsV1) {
  const section = getSectionConfigV1(config, "contact");
  const content = section.content[locale];
  const emailInvalid = invalidV1(fieldErrors, "contact", undefined, "shared.email");
  return (
    <>
      <LayoutPickerV1 labels={[
        { value: "info-left", label: "A · 信息左、表单右" },
        { value: "form-left", label: "B · 表单左、信息右" },
        { value: "stacked", label: "C · 信息上、表单下" }
      ]} value={section.layout} onChange={(layout) => onChange((next) => { getSectionConfigV1(next, "contact").layout = layout as typeof section.layout; })} />
      <div className={styles.fieldGrid}>
        {(["eyebrow", "title", "companyName", "address"] as const).map((field) => (
          <TextFieldV1 key={field} multiline={field === "address"} label={contactLabelsV1[field]} path={`contact.${locale}.${field}`} value={content[field]} invalid={invalidV1(fieldErrors, "contact", locale, field)} onChange={(value) => onChange((next) => { getSectionConfigV1(next, "contact").content[locale][field] = value; })} />
        ))}
      </div>
      <div className={styles.sharedFields} dir="ltr">
        <h3>三语共享联系方式</h3>
        <TextFieldV1 label="共享联系电话" path="contact.shared.phone" value={section.shared.phone} invalid={invalidV1(fieldErrors, "contact", undefined, "shared.phone")} onChange={(value) => onChange((next) => { getSectionConfigV1(next, "contact").shared.phone = value; })} />
        <TextFieldV1
          errorMessage={emailInvalid && section.shared.email.trim() ? "请输入有效邮箱地址" : undefined}
          label="共享业务邮箱"
          path="contact.shared.email"
          value={section.shared.email}
          invalid={emailInvalid}
          onChange={(value) => onChange((next) => { getSectionConfigV1(next, "contact").shared.email = value; })}
        />
      </div>
    </>
  );
}

function MediaPickerV1({ fieldErrors, sectionKey, selected, media, onChange, onUploaded }: {
  fieldErrors: MissingContentFieldV1[];
  sectionKey: "home" | "about";
  selected: string;
  media: MediaRecord[];
  onChange: ChangeConfigV1;
  onUploaded: (record: MediaRecord) => void;
}) {
  const invalid = invalidV1(fieldErrors, sectionKey, undefined, "media.image");
  const errorId = `page-content-${sectionKey}-media-image-error`;
  const thumbnail = safeMediaUrlV1(selected);
  const options = media.some((record) => record.storage_path === selected)
    ? media
    : [{ id: "current", storage_path: selected, variants: {} }, ...media];
  const selectMedia = (record: MediaRecord) => {
    onChange((next) => {
      const section = getSectionConfigV1(next, sectionKey);
      section.media.mediaId = record.id === "current" ? section.media.mediaId : record.id;
      section.media.image = record.storage_path;
    });
  };
  return (
    <div className={styles.mediaPicker} dir="ltr">
      <h3>三语共用主图</h3>
      <label>
        从媒体库选择
        <select
          aria-describedby={invalid ? errorId : undefined}
          aria-invalid={invalid || undefined}
          aria-label="共享主图"
          data-field-path={`${sectionKey}.media.image`}
          value={selected}
          onChange={(event) => {
          const record = options.find((item) => item.storage_path === event.target.value);
          if (record) selectMedia(record);
        }}>
          {options.map((record) => <option key={record.id} value={record.storage_path}>{record.storage_path}</option>)}
        </select>
      </label>
      {invalid ? <small id={errorId} role="alert">请选择一张主图。</small> : null}
      <MediaUpload onUploaded={(record) => {
        onUploaded(record);
        selectMedia(record);
      }} />
      {thumbnail ? (
        <Image
          alt={sectionKey === "home" ? "首页主图缩略图" : "企业介绍主图缩略图"}
          height={120}
          src={thumbnail}
          unoptimized
          width={180}
        />
      ) : <span role="status">当前图片地址无效。</span>}
      <p>已选择：{selected}</p>
    </div>
  );
}

function TextFieldV1({ errorMessage, invalid, label, multiline = false, onChange, path, value }: {
  errorMessage?: string;
  invalid: boolean;
  label: string;
  multiline?: boolean;
  onChange: (value: string) => void;
  path: string;
  value: string;
}) {
  const id = `page-content-${path.replaceAll(".", "-")}`;
  const errorId = `${id}-error`;
  const common = {
    "aria-describedby": invalid ? errorId : undefined,
    "aria-invalid": invalid || undefined,
    "data-field-path": path,
    dir: path.includes(".ar.") ? "rtl" : "ltr",
    id,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
    value
  };
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      {multiline ? <textarea {...common} /> : <input {...common} />}
      {invalid ? <small id={errorId} role="alert">{errorMessage ?? "此字段需要补全。"}</small> : null}
    </div>
  );
}

interface BaseFormPropsV1 {
  config: SiteContentConfigV1;
  fieldErrors: MissingContentFieldV1[];
  locale: Locale;
  onChange: ChangeConfigV1;
}

interface MediaFormPropsV1 {
  media: MediaRecord[];
  onUploaded: (record: MediaRecord) => void;
}

function updateLocalizedV1(
  onChange: ChangeConfigV1,
  sectionKey: "home" | "about" | "products",
  locale: Locale,
  field: string,
  value: string
) {
  onChange((next) => {
    const section = getSectionConfigV1(next, sectionKey);
    (section.content[locale] as Record<string, string | string[]>)[field] = value;
  });
}

function updateAdvantagesContentV1(onChange: ChangeConfigV1, locale: Locale, field: "eyebrow" | "title" | "description", value: string) {
  onChange((next) => { getSectionConfigV1(next, "advantages").content[locale][field] = value; });
}

function invalidV1(
  errors: MissingContentFieldV1[],
  section: SiteSectionKeyV1,
  locale: Locale | undefined,
  field: string
) {
  return errors.some((error) => error.section === section && error.locale === locale && error.field === field);
}

const contactLabelsV1 = {
  eyebrow: "联系我们眉题",
  title: "联系我们主标题",
  companyName: "公司名称",
  address: "公司地址"
};

function safeMediaUrlV1(value: string) {
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
