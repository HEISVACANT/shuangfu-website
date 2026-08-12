import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  defaultSiteContentConfigV1,
  getSectionConfigV1
} from "@/lib/site-content-config-v1";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getUser: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

import {
  saveSiteContentV1,
  type SaveSiteContentStateV1
} from "@/app/admin/actions";

const baseline = {
  sections: ["home", "about", "products", "advantages", "contact"].map((key) => ({
    key,
    updatedAt: "2026-07-29T08:00:00.000Z"
  }))
};

const previousState: SaveSiteContentStateV1 = {
  ok: false,
  code: "DATABASE_ERROR",
  message: "untrusted previous state",
  fieldErrors: [{ section: "home", locale: "zh", field: "untrusted" }],
  savedAt: "not-a-timestamp"
};

function formDataFor(
  payload: unknown = structuredClone(defaultSiteContentConfigV1),
  saveBaseline: unknown = baseline
) {
  const formData = new FormData();
  formData.set("payload", JSON.stringify(payload));
  formData.set("baseline", JSON.stringify(saveBaseline));
  return formData;
}

function setSaveResult(save: { data: unknown; error: unknown }) {
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === "save_site_content_v1") return save;
    throw new Error(`Unexpected RPC: ${name}`);
  });
}

function expectStableFailure(
  state: SaveSiteContentStateV1,
  code: Exclude<SaveSiteContentStateV1["code"], "SUCCESS">
) {
  expect(state).toMatchObject({
    ok: false,
    code,
    savedAt: null
  });
  expect(typeof state.message).toBe("string");
}

describe("saveSiteContentV1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
      rpc: mocks.rpc
    });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "00000000-0000-4000-8000-000000000001" } },
      error: null
    });
    setSaveResult({ data: "2026-07-29T12:00:00Z", error: null });
  });

  it.each(["payload", "baseline"] as const)(
    "rejects malformed %s JSON before creating a Supabase client",
    async (field) => {
      const formData = formDataFor();
      formData.set(field, "{not-json");

      const state = await saveSiteContentV1(previousState, formData);

      expectStableFailure(state, "VALIDATION_ERROR");
      expect(state.fieldErrors).toEqual([]);
      expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    }
  );

  it("rejects a structurally invalid payload before creating a Supabase client", async () => {
    const state = await saveSiteContentV1(previousState, formDataFor({ sections: [] }));

    expectStableFailure(state, "VALIDATION_ERROR");
    expect(state.fieldErrors).toEqual([]);
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("rejects incomplete translations before calling Supabase", async () => {
    const payload = structuredClone(defaultSiteContentConfigV1);
    getSectionConfigV1(payload, "home").content.en.title = "   ";

    const state = await saveSiteContentV1(previousState, formDataFor(payload));

    expectStableFailure(state, "VALIDATION_ERROR");
    expect(state.fieldErrors).toContainEqual({
      section: "home",
      locale: "en",
      field: "title"
    });
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("reports a missing category description with a stable field path", async () => {
    const payload = structuredClone(defaultSiteContentConfigV1);
    getSectionConfigV1(payload, "products").categories[0].translations.ar.description = "";

    const state = await saveSiteContentV1(previousState, formDataFor(payload));

    expectStableFailure(state, "VALIDATION_ERROR");
    expect(state.fieldErrors).toContainEqual({
      section: "products",
      locale: "ar",
      field: "categories.0.translations.description"
    });
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("returns UNAUTHORIZED when no Supabase client is configured", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(null);

    const state = await saveSiteContentV1(previousState, formDataFor());

    expectStableFailure(state, "UNAUTHORIZED");
    expect(state.fieldErrors).toEqual([]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns UNAUTHORIZED when there is no authenticated user", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const state = await saveSiteContentV1(previousState, formDataFor());

    expectStableFailure(state, "UNAUTHORIZED");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns UNAUTHORIZED for an authentication lookup error", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "00000000-0000-4000-8000-000000000001" } },
      error: { code: "bad_jwt", message: "raw auth error" }
    });

    const state = await saveSiteContentV1(previousState, formDataFor());

    expectStableFailure(state, "UNAUTHORIZED");
    expect(JSON.stringify(state)).not.toContain("raw auth error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("maps a stale updated_at baseline to a conflict without revalidation", async () => {
    setSaveResult({
      data: null,
      error: { code: "40001", message: "site_content_conflict" }
    });

    const state = await saveSiteContentV1(previousState, formDataFor());

    expectStableFailure(state, "CONFLICT");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("maps an in-use category database error without revalidation", async () => {
    setSaveResult({
      data: null,
      error: { code: "23503", message: "category_in_use" }
    });

    const state = await saveSiteContentV1(previousState, formDataFor());

    expectStableFailure(state, "CATEGORY_IN_USE");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    { code: "42501", message: "permission denied" },
    { code: "P0001", message: "forbidden" }
  ])("maps a save permission error to FORBIDDEN", async (error) => {
    setSaveResult({ data: null, error });

    const state = await saveSiteContentV1(previousState, formDataFor());

    expectStableFailure(state, "FORBIDDEN");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("maps an unknown database error without leaking its message or payload", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const secret = "service_role_key=top-secret-value";
    const payload = structuredClone(defaultSiteContentConfigV1);
    getSectionConfigV1(payload, "home").content.zh.title = "private-draft-title";
    setSaveResult({
      data: null,
      error: {
        code: "XX000",
        message: `database exploded; ${secret}`,
        details: JSON.stringify(payload)
      }
    });

    const state = await saveSiteContentV1(previousState, formDataFor(payload));

    expectStableFailure(state, "DATABASE_ERROR");
    expect(JSON.stringify(state)).not.toContain("database exploded");
    expect(JSON.stringify(state)).not.toContain("top-secret-value");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("top-secret-value");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("private-draft-title");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a malformed successful timestamp without revalidation", async () => {
    setSaveResult({ data: "not-a-timestamp", error: null });

    const state = await saveSiteContentV1(previousState, formDataFor());

    expectStableFailure(state, "DATABASE_ERROR");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("saves in one authorized transaction without reloading the active editor", async () => {
    const payload = structuredClone(defaultSiteContentConfigV1);
    const formData = formDataFor(payload, baseline);

    const state = await saveSiteContentV1(previousState, formData);

    expect(state).toEqual({
      ok: true,
      code: "SUCCESS",
      message: "已保存并生效。",
      fieldErrors: [],
      savedAt: "2026-07-29T12:00:00Z"
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("save_site_content_v1", {
      p_payload: payload,
      p_baseline: baseline
    });
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/zh"],
      ["/en"],
      ["/ar"],
      ["/api/products"]
    ]);
    expect(JSON.stringify(state)).not.toContain("untrusted previous state");
    expect(JSON.stringify(state)).not.toContain("not-a-timestamp");
  });
});
