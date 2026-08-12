import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { saveSiteContentV1Mock } = vi.hoisted(() => ({
  saveSiteContentV1Mock: vi.fn()
}));

vi.mock("@/app/admin/actions", () => ({
  saveSiteContentV1: saveSiteContentV1Mock
}));

import { PageContentEditorV1 } from "@/components/admin/page-content-editor-v1";
import { MediaUpload } from "@/components/admin/media-upload";
import {
  defaultSiteContentConfigV1,
  getSectionConfigV1,
  type SiteContentConfigV1
} from "@/lib/site-content-config-v1";
import type { SiteContentBaselineV1 } from "@/lib/site-content-repository-v1";

const baseline: SiteContentBaselineV1 = {
  sections: defaultSiteContentConfigV1.sections.map((section, index) => ({
    key: section.key,
    updatedAt: `2026-07-29T0${index}:00:00.000Z`
  }))
};

const media = [{
  id: "11111111-1111-4111-8111-111111111111",
  storage_path: "https://example.test/original.webp",
  variants: { "960": "https://example.test/960.webp" }
}];

function renderEditor(
  config: SiteContentConfigV1 = structuredClone(defaultSiteContentConfigV1),
  mediaRecords = structuredClone(media)
) {
  return render(
    <PageContentEditorV1
      initialConfig={config}
      baseline={structuredClone(baseline)}
      media={mediaRecords}
    />
  );
}

function submittedConfig(call = 0) {
  const formData = saveSiteContentV1Mock.mock.calls[call]?.[1] as FormData;
  return JSON.parse(String(formData.get("payload")));
}

describe("PageContentEditorV1", () => {
  beforeEach(() => {
    saveSiteContentV1Mock.mockReset();
    saveSiteContentV1Mock.mockResolvedValue({
      ok: false,
      code: "DATABASE_ERROR",
      message: "保存失败，请稍后重试。",
      fieldErrors: [],
      savedAt: null
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("opens a one-time preview channel before the new tab and responds to ready once", async () => {
    const events: string[] = [];
    const postMessage = vi.fn(() => events.push("config"));
    const close = vi.fn();
    let receive: ((event: MessageEvent) => void) | null = null;
    class PreviewChannel {
      onmessage: ((event: MessageEvent) => void) | null = null;
      constructor(readonly name: string) {
        events.push(`channel:${name}`);
        receive = (event) => this.onmessage?.(event);
      }
      postMessage = postMessage;
      close = close;
    }
    vi.stubGlobal("BroadcastChannel", PreviewChannel);
    vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-4111-8111-111111111111" });
    vi.spyOn(window, "open").mockImplementation(() => {
      events.push("open");
      return {} as Window;
    });
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "预览效果" }));
    act(() => receive?.({ data: { type: "ready" } } as MessageEvent));
    act(() => receive?.({ data: { type: "ready" } } as MessageEvent));

    expect(events.slice(0, 2)).toEqual([
      "channel:shuangfu:page-content-preview:v1:11111111-1111-4111-8111-111111111111",
      "open"
    ]);
    expect(postMessage).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith({
      type: "config",
      payload: defaultSiteContentConfigV1
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it("keeps the channel alive when noopener returns null and still completes the handshake", () => {
    const postMessage = vi.fn();
    const close = vi.fn();
    let receive: ((event: MessageEvent) => void) | null = null;
    class PreviewChannel {
      onmessage: ((event: MessageEvent) => void) | null = null;
      constructor() {
        receive = (event) => this.onmessage?.(event);
      }
      postMessage = postMessage;
      close = close;
    }
    vi.stubGlobal("BroadcastChannel", PreviewChannel);
    vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-4111-8111-111111111111" });
    vi.spyOn(window, "open").mockReturnValue(null);
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "预览效果" }));
    expect(close).not.toHaveBeenCalled();
    act(() => receive?.({ data: { type: "ready" } } as MessageEvent));

    expect(close).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledOnce();
    expect(screen.queryByText("未能连接预览标签页，请重试并确认浏览器允许弹窗。")).not.toBeInTheDocument();
  });

  it("keeps the producer alive beyond the consumer timeout and responds once to a late ready", async () => {
    vi.useFakeTimers();
    const postMessage = vi.fn();
    const close = vi.fn();
    let receive: ((event: MessageEvent) => void) | null = null;
    class PreviewChannel {
      onmessage: ((event: MessageEvent) => void) | null = null;
      constructor() {
        receive = (event) => this.onmessage?.(event);
      }
      postMessage = postMessage;
      close = close;
    }
    vi.stubGlobal("BroadcastChannel", PreviewChannel);
    vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-4111-8111-111111111111" });
    vi.spyOn(window, "open").mockReturnValue({} as Window);
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "预览效果" }));
    await act(() => vi.advanceTimersByTimeAsync(5001));

    expect(close).not.toHaveBeenCalled();
    act(() => receive?.({ data: { type: "ready" } } as MessageEvent));
    act(() => receive?.({ data: { type: "ready" } } as MessageEvent));

    expect(postMessage).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("cleans up an editor-side preview channel after thirty seconds", async () => {
    vi.useFakeTimers();
    const close = vi.fn();
    class PreviewChannel {
      onmessage: ((event: MessageEvent) => void) | null = null;
      postMessage = vi.fn();
      close = close;
    }
    vi.stubGlobal("BroadcastChannel", PreviewChannel);
    vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-4111-8111-111111111111" });
    vi.spyOn(window, "open").mockReturnValue({} as Window);
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "预览效果" }));
    await act(() => vi.advanceTimersByTimeAsync(29_999));
    expect(close).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));

    expect(close).toHaveBeenCalledOnce();
    expect(screen.getByText("未能连接预览标签页，请重试并确认浏览器允许弹窗。")).toBeInTheDocument();
  });

  it("shows real English values and keeps the Chinese translation isolated", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("tab", { name: "English" }));
    expect(screen.getByLabelText("首页主标题")).toHaveValue(
      defaultSiteContentConfigV1.sections[0].content.en.title
    );
    await user.clear(screen.getByLabelText("首页主标题"));
    await user.type(screen.getByLabelText("首页主标题"), "New English title");
    await user.click(screen.getByRole("tab", { name: "中文" }));

    expect(screen.getByLabelText("首页主标题")).toHaveValue(
      defaultSiteContentConfigV1.sections[0].content.zh.title
    );
  });

  it("moves a non-default section down and rewrites every sort order", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "下移 企业介绍" }));

    expect(screen.getAllByTestId("page-content-section").map((item) => item.textContent)).toEqual([
      expect.stringContaining("首页"),
      expect.stringContaining("产品介绍"),
      expect.stringContaining("企业介绍"),
      expect.stringContaining("合作优势"),
      expect.stringContaining("联系我们")
    ]);
    await user.click(screen.getByRole("button", { name: "保存并立即生效" }));
    await waitFor(() => expect(saveSiteContentV1Mock).toHaveBeenCalledOnce());
    expect(submittedConfig().sections.map((section: { key: string; sortOrder: number }) => [
      section.key,
      section.sortOrder
    ])).toEqual([
      ["home", 0], ["products", 1], ["about", 2], ["advantages", 3], ["contact", 4]
    ]);
  });

  it("selects the B layout for home", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("radio", { name: "B · 图左文右" }));

    expect(screen.getByRole("radio", { name: "B · 图左文右" })).toBeChecked();
  });

  it("adds, disables and edits a product category without exposing slug editing", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "编辑 产品介绍" }));

    await user.click(screen.getByRole("button", { name: "新增分类" }));
    const card = screen.getAllByTestId(/^product-category-/).at(-1)!;
    await user.type(within(card).getByLabelText("分类名称"), "新分类");
    await user.click(within(card).getByRole("checkbox", { name: "启用分类" }));

    expect(within(card).getByLabelText("分类名称")).toHaveValue("新分类");
    expect(within(card).getByRole("checkbox", { name: "启用分类" })).not.toBeChecked();
    expect(within(card).queryByLabelText("分类 slug")).not.toBeInTheDocument();
  });

  it("prevents deletion of a referenced product category with an explicit explanation", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "编辑 产品介绍" }));

    const card = screen.getByTestId("product-category-b8c8fe47-2268-4f88-bf2a-3d751c2fa001");
    expect(within(card).getByRole("button", { name: "删除分类" })).toBeDisabled();
    expect(within(card).getByText("已关联 14 个产品，请先迁移产品后再删除。")).toBeInTheDocument();
  });

  it("adds and reorders an advantage step and chooses one of six controlled icons", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "编辑 合作优势" }));

    await user.click(screen.getByRole("button", { name: "新增优势步骤" }));
    const step = screen.getAllByTestId(/^advantage-step-/).at(-1)!;
    expect(step.dataset.testid).toMatch(/^advantage-step-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(within(step).getAllByRole("option")).toHaveLength(6);
    await user.selectOptions(within(step).getByLabelText("步骤图标"), "quality");
    await user.click(within(step).getByRole("button", { name: "上移优势步骤" }));

    expect(within(step).getByLabelText("步骤图标")).toHaveValue("quality");
  });

  it("edits shared contact values independently of locale tabs", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "编辑 联系我们" }));

    await user.clear(screen.getByLabelText("共享联系电话"));
    await user.type(screen.getByLabelText("共享联系电话"), "+86 400 000 0000");
    await user.click(screen.getByRole("tab", { name: "English" }));

    expect(screen.getByLabelText("共享联系电话")).toHaveValue("+86 400 000 0000");
  });

  it("uses the upload callback to select newly uploaded media immediately", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      id: "22222222-2222-4222-8222-222222222222",
      storage_path: "https://example.test/uploaded.webp",
      variants: { "960": "https://example.test/uploaded-960.webp" }
    }), { status: 201, headers: { "Content-Type": "application/json" } }));
    renderEditor();

    await user.upload(screen.getByLabelText("选择图片"), new File(["image"], "hero.webp", { type: "image/webp" }));

    expect(await screen.findByText("已选择：https://example.test/uploaded.webp")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "首页主图缩略图" })).toHaveAttribute(
      "src",
      "https://example.test/uploaded.webp"
    );
  });

  it("marks changes dirty and only then protects browser unload", async () => {
    const user = userEvent.setup();
    const addListener = vi.spyOn(window, "addEventListener");
    renderEditor();
    expect(addListener.mock.calls.some(([type]) => type === "beforeunload")).toBe(false);

    await user.type(screen.getByLabelText("首页主标题"), " updated");

    expect(screen.getByText("有未保存更改")).toBeInTheDocument();
    expect(addListener.mock.calls.some(([type]) => type === "beforeunload")).toBe(true);
  });

  it("shows a field error, selects its locale and focuses the missing field", async () => {
    const user = userEvent.setup();
    saveSiteContentV1Mock.mockResolvedValueOnce({
      ok: false,
      code: "VALIDATION_ERROR",
      message: "请补全或修正页面内容后再保存。",
      fieldErrors: [{ section: "home", locale: "en", field: "title" }],
      savedAt: null
    });
    renderEditor();

    await user.click(screen.getByRole("button", { name: "保存并立即生效" }));

    expect(await screen.findByText("请补全或修正页面内容后再保存。")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("tab", { name: "English" })).toHaveAttribute("aria-selected", "true"));
    await waitFor(() => expect(screen.getByLabelText("首页主标题")).toHaveFocus());
    expect(screen.getByLabelText("首页主标题")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows success time, clears dirty and advances all five baseline timestamps", async () => {
    const user = userEvent.setup();
    const savedAt = "2026-07-29T12:34:56.000Z";
    saveSiteContentV1Mock
      .mockResolvedValueOnce({
        ok: true,
        code: "SUCCESS",
        message: "已保存并生效。",
        fieldErrors: [],
        savedAt
      })
      .mockResolvedValueOnce({
        ok: false,
        code: "DATABASE_ERROR",
        message: "保存失败，请稍后重试。",
        fieldErrors: [],
        savedAt: null
      });
    renderEditor();
    await user.type(screen.getByLabelText("首页主标题"), " updated");

    await user.click(screen.getByRole("button", { name: "保存并立即生效" }));

    expect(await screen.findByText(/2026.*12:34:56/)).toBeInTheDocument();
    expect(await screen.findByText("已保存")).toBeInTheDocument();
    await user.type(screen.getByLabelText("首页主标题"), " again");
    await user.click(screen.getByRole("button", { name: "保存并立即生效" }));
    await waitFor(() => expect(saveSiteContentV1Mock).toHaveBeenCalledTimes(2));
    const secondBaseline = JSON.parse(String((saveSiteContentV1Mock.mock.calls[1][1] as FormData).get("baseline")));
    expect(secondBaseline.sections).toEqual(defaultSiteContentConfigV1.sections.map((section) => ({
      key: section.key,
      updatedAt: savedAt
    })));
  });

  it("supports drag sorting while keeping fixed sections enabled", () => {
    renderEditor();
    const about = screen.getAllByTestId("page-content-section")[1];
    const products = screen.getAllByTestId("page-content-section")[2];

    fireEvent.dragStart(about);
    fireEvent.dragOver(products);
    fireEvent.drop(products);

    expect(screen.getAllByTestId("page-content-section")[2]).toHaveTextContent("企业介绍");
    expect(screen.queryByRole("button", { name: /删除板块|停用板块/ })).not.toBeInTheDocument();
  });

  it("keeps a pending edit dirty when an earlier submitted revision succeeds", async () => {
    const user = userEvent.setup();
    const removeListener = vi.spyOn(window, "removeEventListener");
    let resolveSave!: (state: {
      ok: boolean;
      code: "SUCCESS";
      message: string;
      fieldErrors: [];
      savedAt: string;
    }) => void;
    const pendingSave = new Promise<Parameters<typeof resolveSave>[0]>((resolve) => {
      resolveSave = resolve;
    });
    saveSiteContentV1Mock.mockReturnValueOnce(pendingSave);
    renderEditor();
    const title = screen.getByLabelText("首页主标题");
    await user.clear(title);
    await user.type(title, "Revision A");
    await user.click(screen.getByRole("button", { name: "保存并立即生效" }));
    await waitFor(() => expect(saveSiteContentV1Mock).toHaveBeenCalledOnce());

    await user.clear(title);
    await user.type(title, "Revision B");
    await act(async () => resolveSave({
      ok: true,
      code: "SUCCESS",
      message: "已保存并生效。",
      fieldErrors: [],
      savedAt: "2026-07-30T01:02:03.000Z"
    }));

    expect(await screen.findByText("有未保存更改")).toBeInTheDocument();
    expect(title).toHaveValue("Revision B");
    expect(screen.getByText(/2026.*01:02:03/)).toBeInTheDocument();
    expect(removeListener.mock.calls.some(([type]) => type === "beforeunload")).toBe(false);
  });

  it("ignores a stale validation response after the editor revision changes", async () => {
    const user = userEvent.setup();
    let resolveSave!: (state: {
      ok: false;
      code: "VALIDATION_ERROR";
      message: string;
      fieldErrors: [{ section: "home"; locale: "en"; field: "title" }];
      savedAt: null;
    }) => void;
    const pendingSave = new Promise<Parameters<typeof resolveSave>[0]>((resolve) => {
      resolveSave = resolve;
    });
    saveSiteContentV1Mock.mockReturnValueOnce(pendingSave);
    renderEditor();

    const title = screen.getByLabelText("首页主标题");
    await user.type(title, " Revision A");
    await user.click(screen.getByRole("button", { name: "保存并立即生效" }));
    await waitFor(() => expect(saveSiteContentV1Mock).toHaveBeenCalledOnce());
    await user.type(title, " Revision B");
    await user.click(screen.getByRole("button", { name: "编辑 联系我们" }));
    await user.click(screen.getByRole("tab", { name: "العربية" }));
    const contactTitle = screen.getByLabelText("联系我们主标题");
    contactTitle.focus();

    await act(async () => resolveSave({
      ok: false,
      code: "VALIDATION_ERROR",
      message: "旧错误不应显示",
      fieldErrors: [{ section: "home", locale: "en", field: "title" }],
      savedAt: null
    }));

    expect(screen.getByRole("heading", { name: "联系我们" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "العربية" })).toHaveAttribute("aria-selected", "true");
    expect(contactTitle).toHaveFocus();
    expect(screen.queryByText("旧错误不应显示")).not.toBeInTheDocument();
  });

  it("keeps a prior validation response hidden during a corrected resubmission and accepts its success", async () => {
    const user = userEvent.setup();
    let resolveValidation!: (state: {
      ok: false;
      code: "VALIDATION_ERROR";
      message: string;
      fieldErrors: [{ section: "home"; locale: "en"; field: "title" }];
      savedAt: null;
    }) => void;
    let resolveSuccess!: (state: {
      ok: true;
      code: "SUCCESS";
      message: string;
      fieldErrors: [];
      savedAt: string;
    }) => void;
    saveSiteContentV1Mock
      .mockReturnValueOnce(new Promise((resolve) => { resolveValidation = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveSuccess = resolve; }));
    renderEditor();

    fireEvent.change(screen.getByLabelText("首页主标题"), { target: { value: "Revision 1" } });
    await user.click(screen.getByRole("button", { name: "保存并立即生效" }));
    await waitFor(() => expect(saveSiteContentV1Mock).toHaveBeenCalledOnce());
    await act(async () => resolveValidation({
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Revision 1 validation",
      fieldErrors: [{ section: "home", locale: "en", field: "title" }],
      savedAt: null
    }));
    expect(await screen.findByText("Revision 1 validation")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("首页主标题")).toHaveFocus());

    fireEvent.change(screen.getByLabelText("首页主标题"), { target: { value: "Revision 2 fixed" } });
    expect(screen.queryByText("Revision 1 validation")).not.toBeInTheDocument();
    expect(screen.getByLabelText("首页主标题")).not.toHaveAttribute("aria-invalid");
    await user.click(screen.getByRole("button", { name: "编辑 联系我们" }));
    await user.click(screen.getByRole("tab", { name: "العربية" }));
    const contactTitle = screen.getByLabelText("联系我们主标题");
    contactTitle.focus();

    fireEvent.submit(contactTitle.closest("form")!);
    await waitFor(() => expect(saveSiteContentV1Mock).toHaveBeenCalledTimes(2));
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 10)); });
    const staleMessageReturned = screen.queryByText("Revision 1 validation") !== null;
    const stayedOnContact = screen.queryByRole("heading", { name: "联系我们" }) !== null;
    const keptFocus = document.activeElement === contactTitle;

    await act(async () => resolveSuccess({
      ok: true,
      code: "SUCCESS",
      message: "Revision 2 saved",
      fieldErrors: [],
      savedAt: "2026-07-30T02:03:04.000Z"
    }));
    expect(staleMessageReturned).toBe(false);
    expect(stayedOnContact).toBe(true);
    expect(keptFocus).toBe(true);
    expect(await screen.findByText("Revision 2 saved")).toBeInTheDocument();
    expect(await screen.findByText("已保存")).toBeInTheDocument();
    expect(screen.getByText(/2026.*02:03:04/)).toBeInTheDocument();
  });

  it("attributes consecutive validation response identities to their own revisions", async () => {
    const user = userEvent.setup();
    let resolveFirst!: (state: {
      ok: false;
      code: "VALIDATION_ERROR";
      message: string;
      fieldErrors: [{ section: "home"; locale: "en"; field: "title" }];
      savedAt: null;
    }) => void;
    let resolveSecond!: (state: {
      ok: false;
      code: "VALIDATION_ERROR";
      message: string;
      fieldErrors: [{ section: "contact"; locale: "ar"; field: "title" }];
      savedAt: null;
    }) => void;
    saveSiteContentV1Mock
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve; }));
    renderEditor();

    fireEvent.change(screen.getByLabelText("首页主标题"), { target: { value: "First revision" } });
    await user.click(screen.getByRole("button", { name: "保存并立即生效" }));
    await waitFor(() => expect(saveSiteContentV1Mock).toHaveBeenCalledOnce());
    await act(async () => resolveFirst({
      ok: false,
      code: "VALIDATION_ERROR",
      message: "First validation",
      fieldErrors: [{ section: "home", locale: "en", field: "title" }],
      savedAt: null
    }));
    expect(await screen.findByText("First validation")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("首页主标题"), { target: { value: "Second revision" } });
    await user.click(screen.getByRole("button", { name: "保存并立即生效" }));
    await waitFor(() => expect(saveSiteContentV1Mock).toHaveBeenCalledTimes(2));
    const firstValidationReturned = screen.queryByText("First validation") !== null;

    await act(async () => resolveSecond({
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Second validation",
      fieldErrors: [{ section: "contact", locale: "ar", field: "title" }],
      savedAt: null
    }));
    expect(firstValidationReturned).toBe(false);
    expect(await screen.findByText("Second validation")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: "联系我们" })).toBeInTheDocument());
    expect(screen.getByRole("tab", { name: "العربية" })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(screen.getByLabelText("联系我们主标题")).toHaveFocus());
    expect(screen.getByLabelText("联系我们主标题")).toHaveAttribute("aria-invalid", "true");
  });

  it("validates translations live and clears the field and tab error after correction", async () => {
    const user = userEvent.setup();
    const config = structuredClone(defaultSiteContentConfigV1);
    getSectionConfigV1(config, "home").content.en.title = "";
    renderEditor(config);

    expect(screen.getByRole("tab", { name: "English" })).toHaveTextContent("1");
    await user.click(screen.getByRole("tab", { name: "English" }));
    const title = screen.getByLabelText("首页主标题");
    expect(title).toHaveAttribute("aria-invalid", "true");

    await user.type(title, "Complete English title");

    expect(title).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("tab", { name: "English" })).not.toHaveTextContent("1");
  });

  it("maps an invalid shared email to a stable live field error", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "编辑 联系我们" }));
    const email = screen.getByLabelText("共享业务邮箱");

    await user.clear(email);
    await user.type(email, "not-an-email");

    expect(email).toHaveAttribute("data-field-path", "contact.shared.email");
    expect(email).toHaveAttribute("aria-invalid", "true");
  });

  it("combines an invalid email with required translation errors and preserves the latter after correction", async () => {
    const user = userEvent.setup();
    const config = structuredClone(defaultSiteContentConfigV1);
    getSectionConfigV1(config, "contact").shared.email = "not-an-email";
    const categories = getSectionConfigV1(config, "products").categories;
    categories.push({
      id: "33333333-3333-4333-8333-333333333333",
      slug: "new-empty-category",
      enabled: true,
      sortOrder: categories.length,
      productReferenceCount: 0,
      translations: {
        zh: { name: "", description: "" },
        en: { name: "", description: "" },
        ar: { name: "", description: "" }
      }
    });
    renderEditor(config);

    await user.click(screen.getByRole("button", { name: "编辑 联系我们" }));
    const email = screen.getByLabelText("共享业务邮箱");
    expect(email).toHaveAccessibleDescription("请输入有效邮箱地址");

    await user.click(screen.getByRole("button", { name: "编辑 产品介绍" }));
    expect(screen.getByRole("tab", { name: "中文" })).toHaveTextContent("2");
    expect(screen.getByRole("tab", { name: "English" })).toHaveTextContent("2");
    expect(screen.getByRole("tab", { name: "العربية" })).toHaveTextContent("2");
    expect(screen.getAllByText("此字段需要补全。")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "编辑 联系我们" }));
    const currentEmail = screen.getByLabelText("共享业务邮箱");
    await user.clear(currentEmail);
    expect(currentEmail).toHaveAccessibleDescription("此字段需要补全。");
    await user.type(currentEmail, "sales@example.com");
    expect(currentEmail).not.toHaveAttribute("aria-invalid");
    await user.click(screen.getByRole("button", { name: "编辑 产品介绍" }));
    expect(screen.getByRole("tab", { name: "English" })).toHaveTextContent("2");
  });

  it("does not turn valid fields red for a non-field action failure", async () => {
    const user = userEvent.setup();
    saveSiteContentV1Mock.mockResolvedValueOnce({
      ok: false,
      code: "DATABASE_ERROR",
      message: "保存失败，请稍后重试。",
      fieldErrors: [{ section: "home", locale: "zh", field: "title" }],
      savedAt: null
    });
    renderEditor();

    await user.click(screen.getByRole("button", { name: "保存并立即生效" }));
    expect(await screen.findByText("保存失败，请稍后重试。")).toBeInTheDocument();

    expect(screen.getByLabelText("首页主标题")).not.toHaveAttribute("aria-invalid");
  });

  it("provides focusable group errors for a missing image and no enabled categories", async () => {
    const user = userEvent.setup();
    const config = structuredClone(defaultSiteContentConfigV1);
    getSectionConfigV1(config, "home").media.image = "";
    getSectionConfigV1(config, "products").categories.forEach((category) => { category.enabled = false; });
    renderEditor(config);

    expect(screen.getByLabelText("共享主图")).toHaveAttribute("data-field-path", "home.media.image");
    expect(screen.getByLabelText("共享主图")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("共享主图")).toHaveAccessibleDescription("请选择一张主图。");
    await user.click(screen.getByRole("button", { name: "编辑 产品介绍" }));
    expect(screen.getByTestId("product-categories-group")).toHaveAttribute("data-field-path", "products.categories");
    expect(screen.getByTestId("product-categories-group")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("product-categories-group")).toHaveAccessibleName("产品分类");
    expect(screen.getByTestId("product-categories-group")).toHaveAccessibleDescription("请至少保留一个启用分类。");
  });

  it("blocks an invalid local submission and focuses the first error section and locale", async () => {
    const user = userEvent.setup();
    const config = structuredClone(defaultSiteContentConfigV1);
    getSectionConfigV1(config, "about").content.en.title = "";
    renderEditor(config);

    await user.click(screen.getByRole("button", { name: "保存并立即生效" }));

    expect(saveSiteContentV1Mock).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "企业介绍" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "English" })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(screen.getByLabelText("企业介绍主标题")).toHaveFocus());
  });

  it("submits only after a client-side error is corrected", async () => {
    const user = userEvent.setup();
    const config = structuredClone(defaultSiteContentConfigV1);
    getSectionConfigV1(config, "products").categories.forEach((category) => { category.enabled = false; });
    renderEditor(config);

    await user.click(screen.getByRole("button", { name: "保存并立即生效" }));
    expect(saveSiteContentV1Mock).not.toHaveBeenCalled();
    const group = screen.getByTestId("product-categories-group");
    expect(group).toHaveFocus();
    expect(within(group).getByRole("alert")).toHaveTextContent("请至少保留一个启用分类。");

    await user.click(within(screen.getAllByTestId(/^product-category-/)[0]).getByRole("checkbox", { name: "启用分类" }));
    await user.click(screen.getByRole("button", { name: "保存并立即生效" }));
    await waitFor(() => expect(saveSiteContentV1Mock).toHaveBeenCalledOnce());
  });

  it("renders safe media thumbnails for both image sections", async () => {
    const user = userEvent.setup();
    renderEditor();

    expect(screen.getByRole("img", { name: "首页主图缩略图" })).toHaveAttribute("src", expect.stringContaining("hero-products-placeholder-v1.png"));
    await user.click(screen.getByRole("button", { name: "编辑 企业介绍" }));
    expect(screen.getByRole("img", { name: "企业介绍主图缩略图" })).toHaveAttribute("src", expect.stringContaining("company-craft-placeholder-v1.png"));
  });

  it.each([
    ["invalid response", new Response(JSON.stringify({ id: "broken" }), { status: 201 })],
    ["failed response", new Response(JSON.stringify({ code: "UPLOAD_FAILED" }), { status: 500 })]
  ])("rejects an %s without calling the upload callback", async (_case, response) => {
    const user = userEvent.setup();
    const onUploaded = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    render(<MediaUpload onUploaded={onUploaded} />);

    await user.upload(screen.getByLabelText("选择图片"), new File(["image"], "hero.webp", { type: "image/webp" }));

    expect(await screen.findByRole("status")).toHaveTextContent("上传失败");
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("enforces advantage step UUIDs and the one-to-eight item limits", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "编辑 合作优势" }));
    const add = screen.getByRole("button", { name: "新增优势步骤" });
    await user.click(add);
    expect(screen.getAllByTestId(/^advantage-step-/).at(-1)!.dataset.testid).toMatch(/^advantage-step-[0-9a-f-]{36}$/i);

    while (screen.getAllByTestId(/^advantage-step-/).length < 8) await user.click(add);
    expect(add).toBeDisabled();
    while (screen.getAllByTestId(/^advantage-step-/).length > 1) {
      await user.click(screen.getAllByRole("button", { name: "删除优势步骤" })[0]);
    }
    expect(screen.getByRole("button", { name: "删除优势步骤" })).toBeDisabled();
  });

  it("updates category completeness live", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "编辑 产品介绍" }));
    await user.click(screen.getByRole("button", { name: "新增分类" }));
    const card = screen.getAllByTestId(/^product-category-/).at(-1)!;
    expect(card.dataset.testid).toMatch(
      /^product-category-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(within(card).getByText("缺失 3 种语言")).toBeInTheDocument();

    await user.type(within(card).getByLabelText("分类名称"), "新分类");
    await user.type(within(card).getByLabelText("分类介绍"), "中文介绍");

    expect(within(card).getByText("缺失 2 种语言")).toBeInTheDocument();
  });

  it("confirms deletion of an unreferenced category", async () => {
    const user = userEvent.setup();
    const config = structuredClone(defaultSiteContentConfigV1);
    getSectionConfigV1(config, "products").categories[0].productReferenceCount = 0;
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderEditor(config);
    await user.click(screen.getByRole("button", { name: "编辑 产品介绍" }));
    const card = screen.getByTestId("product-category-b8c8fe47-2268-4f88-bf2a-3d751c2fa001");

    await user.click(within(card).getByRole("button", { name: "删除分类" }));

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("product-category-b8c8fe47-2268-4f88-bf2a-3d751c2fa001")).not.toBeInTheDocument();
  });

  it("reorders categories and keeps a generated slug stable across later edits", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "编辑 产品介绍" }));
    await user.click(screen.getByRole("button", { name: "新增分类" }));
    const newCard = screen.getAllByTestId(/^product-category-/).at(-1)!;
    const slug = within(newCard).getByTestId("category-slug").textContent;
    await user.type(within(newCard).getByLabelText("分类名称"), "First");
    await user.clear(within(newCard).getByLabelText("分类名称"));
    await user.type(within(newCard).getByLabelText("分类名称"), "Second");
    await user.click(within(newCard).getByRole("button", { name: "上移分类" }));

    expect(within(newCard).getByTestId("category-slug")).toHaveTextContent(slug!);
    expect(screen.getAllByTestId(/^product-category-/)[1]).toBe(newCard);
  });

  it("uses unique navigation paths with a focusable group error", () => {
    const config = structuredClone(defaultSiteContentConfigV1);
    getSectionConfigV1(config, "home").content.zh.nav[1] = "";
    renderEditor(config);
    const fields = screen.getAllByLabelText(/^导航 [1-4]$/);

    expect(fields.map((field) => field.id)).toHaveLength(new Set(fields.map((field) => field.id)).size);
    expect(fields.map((field) => field.dataset.fieldPath)).toEqual([
      "home.zh.nav.0", "home.zh.nav.1", "home.zh.nav.2", "home.zh.nav.3"
    ]);
    expect(screen.getByTestId("home-nav-fields")).toHaveAttribute("data-field-path", "home.zh.nav");
    expect(screen.getByTestId("home-nav-fields")).toHaveAttribute("aria-invalid", "true");
  });

  it("keeps Arabic inputs RTL while the editor labels remain LTR", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("tab", { name: "العربية" }));

    expect(screen.getByLabelText("首页主标题")).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("dir", "ltr");
  });

  it("enumerates all fifteen section layout choices", async () => {
    const user = userEvent.setup();
    renderEditor();
    const expected: Array<[string, string[]]> = [
      ["首页", ["A · 文左图右", "B · 图左文右", "C · 居中大标题"]],
      ["企业介绍", ["A · 文左图右", "B · 图左文右", "C · 上图下文"]],
      ["产品介绍", ["A · 分类标签＋网格", "B · 分类折叠", "C · 主推＋产品网格"]],
      ["合作优势", ["A · 横向卡片", "B · 两列步骤", "C · 垂直流程"]],
      ["联系我们", ["A · 信息左、表单右", "B · 表单左、信息右", "C · 信息上、表单下"]]
    ];
    for (const [section, layouts] of expected) {
      if (section !== "首页") await user.click(screen.getByRole("button", { name: `编辑 ${section}` }));
      expect(screen.getAllByRole("radio").map((radio) => radio.parentElement?.textContent)).toEqual(layouts);
    }
    expect(expected.flatMap(([, layouts]) => layouts)).toHaveLength(15);
    expect(screen.getByLabelText("联系我们主标题")).toBeInTheDocument();
  });
});
