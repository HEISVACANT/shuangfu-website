import { createHmac } from "node:crypto";

import { z } from "zod";

export const inquirySubmissionSchema = z.object({
  name: z.string().trim().min(2).max(100),
  company: z.string().trim().min(2).max(160),
  countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase()),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  phoneWhatsApp: z.string().trim().min(5).max(60),
  categoryId: z.uuid(),
  productId: z.string().trim().max(100).optional().nullable(),
  estimatedQuantity: z.string().trim().max(100),
  message: z.string().trim().max(3000).default(""),
  privacyConsent: z.literal(true),
  locale: z.enum(["zh", "en", "ar"]),
  turnstileToken: z.string().trim().min(1).max(2048),
  website: z.string().trim().max(500).default("")
});

export type InquirySubmission = z.infer<typeof inquirySubmissionSchema>;
export type InquiryErrorCode = "SPAM_DETECTED" | "VALIDATION_ERROR";

export function parseInquirySubmission(
  input: unknown
):
  | { ok: true; data: InquirySubmission }
  | { ok: false; code: InquiryErrorCode } {
  const website =
    typeof input === "object" && input !== null && "website" in input
      ? String(input.website).trim()
      : "";
  if (website) {
    return { ok: false, code: "SPAM_DETECTED" };
  }

  const result = inquirySubmissionSchema.safeParse(input);
  if (!result.success) {
    return { ok: false, code: "VALIDATION_ERROR" };
  }

  return { ok: true, data: result.data };
}

export function createIpHash(ipAddress: string, secret: string): string {
  return createHmac("sha256", secret).update(ipAddress).digest("hex");
}

export function isInquiryQuantityValidForCategory(
  submission: Pick<InquirySubmission, "estimatedQuantity">,
  categorySlug: string
) {
  return categorySlug === "custom-development" || submission.estimatedQuantity.length > 0;
}

export function buildInquiryPersistenceV1(
  submission: InquirySubmission,
  input: { id: string; ownerEmail: string }
) {
  const payload = {
    name: submission.name,
    company: submission.company,
    countryCode: submission.countryCode,
    email: submission.email,
    phoneWhatsApp: submission.phoneWhatsApp,
    productId: submission.productId,
    estimatedQuantity: submission.estimatedQuantity,
    message: submission.message,
    privacyConsent: submission.privacyConsent,
    locale: submission.locale
  };
  return {
    rpcArgs: {
      p_id: input.id,
      p_payload: payload,
      p_country_code: submission.countryCode,
      p_owner_email: input.ownerEmail,
      p_category_id: submission.categoryId
    }
  };
}
