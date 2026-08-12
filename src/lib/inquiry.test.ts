import { describe, expect, it } from "vitest";

import {
  buildInquiryPersistenceV1,
  createIpHash,
  parseInquirySubmission
} from "@/lib/inquiry";

const validSubmission = {
  name: "Amina Hassan",
  company: "Example Apparel",
  countryCode: "AE",
  email: "amina@example.com",
  phoneWhatsApp: "+971 50 000 0000",
  categoryId: "b8c8fe47-2268-4f88-bf2a-3d751c2fa004",
  productId: "pad-01",
  estimatedQuantity: "1000-5000",
  message: "Please send more information.",
  privacyConsent: true,
  locale: "ar",
  turnstileToken: "verified-token",
  website: ""
};

describe("parseInquirySubmission", () => {
  it("accepts a complete B2B inquiry and normalizes its email", () => {
    expect(
      parseInquirySubmission({ ...validSubmission, email: " AMINA@EXAMPLE.COM " })
    ).toMatchObject({
      ok: true,
      data: { email: "amina@example.com", countryCode: "AE" }
    });
  });

  it("rejects a submission when the honeypot is filled", () => {
    expect(
      parseInquirySubmission({ ...validSubmission, website: "https://spam.test" })
    ).toEqual({ ok: false, code: "SPAM_DETECTED" });
  });

  it("rejects a submission without privacy consent", () => {
    expect(
      parseInquirySubmission({ ...validSubmission, privacyConsent: false })
    ).toEqual({ ok: false, code: "VALIDATION_ERROR" });
  });

  it("rejects malformed country and locale values", () => {
    expect(
      parseInquirySubmission({
        ...validSubmission,
        countryCode: "United Arab Emirates",
        locale: "fr"
      })
    ).toEqual({ ok: false, code: "VALIDATION_ERROR" });
  });

  it("accepts a category UUID and rejects a legacy category slug", () => {
    expect(parseInquirySubmission(validSubmission)).toMatchObject({ ok: true });
    expect(parseInquirySubmission({ ...validSubmission, categoryId: "swimwear-cups" }))
      .toEqual({ ok: false, code: "VALIDATION_ERROR" });
    const withoutCategory = { ...validSubmission } as Partial<typeof validSubmission>;
    delete withoutCategory.categoryId;
    expect(parseInquirySubmission({ ...withoutCategory, productCategory: "swimwear-cups" }))
      .toEqual({ ok: false, code: "VALIDATION_ERROR" });
  });
});

describe("createIpHash", () => {
  it("creates a stable digest without exposing the raw IP", () => {
    const digest = createIpHash("203.0.113.10", "test-secret");

    expect(digest).toBe(createIpHash("203.0.113.10", "test-secret"));
    expect(digest).not.toContain("203.0.113.10");
    expect(digest).toHaveLength(64);
  });

  it("separates the same IP across different secrets", () => {
    expect(createIpHash("203.0.113.10", "secret-a")).not.toBe(
      createIpHash("203.0.113.10", "secret-b")
    );
  });
});

describe("buildInquiryPersistenceV1", () => {
  it("passes only categoryId to the RPC and leaves the localized name snapshot to the database", () => {
    const parsed = parseInquirySubmission(validSubmission);
    if (!parsed.ok) throw new Error("fixture must be valid");

    const persistence = buildInquiryPersistenceV1(parsed.data, {
      id: "inquiry-1",
      ownerEmail: "owner@example.com"
    });

    expect(persistence.rpcArgs.p_category_id).toBe(validSubmission.categoryId);
    expect(persistence.rpcArgs.p_payload).not.toHaveProperty("categoryName");
    expect(persistence.rpcArgs.p_payload).not.toHaveProperty("categorySlug");
  });
});
