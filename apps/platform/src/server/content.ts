import { z } from "zod";

export const platformVersionInput = z
  .object({
    platform: z.enum(["youtube", "facebook", "tiktok"]),
    accountReference: z.string().trim().min(1).max(255),
    accountDisplayName: z.string().trim().min(1).max(255),
    title: z.string().trim().min(1).max(2200),
    description: z.string().max(5000),
    privacyStatus: z.enum(["unselected", "private", "unlisted", "public"]),
    madeForKids: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.platform === "facebook" && value.privacyStatus !== "public") {
      context.addIssue({
        code: "custom",
        path: ["privacyStatus"],
        message: "Facebook Page video publication uses Page-visible delivery",
      });
    }
    if (value.platform === "facebook" && value.madeForKids) {
      context.addIssue({
        code: "custom",
        path: ["madeForKids"],
        message: "YouTube audience settings do not apply to Facebook",
      });
    }
    if (value.platform === "tiktok" && value.privacyStatus !== "unselected") {
      context.addIssue({
        code: "custom",
        path: ["privacyStatus"],
        message: "TikTok privacy must be chosen manually from fresh Creator Info at publish time",
      });
    }
    if (value.platform === "tiktok" && value.madeForKids) {
      context.addIssue({
        code: "custom",
        path: ["madeForKids"],
        message: "YouTube audience settings do not apply to TikTok",
      });
    }
    if (value.platform !== "tiktok" && value.title.length > 100) {
      context.addIssue({
        code: "custom",
        path: ["title"],
        message: "YouTube and Facebook titles are limited to 100 characters",
      });
    }
  });

const platformVersionsInput = z
  .array(platformVersionInput)
  .min(1)
  .max(10)
  .superRefine((versions, context) => {
    const identities = versions.map((entry) => `${entry.platform}:${entry.accountReference}`);
    if (new Set(identities).size !== identities.length) {
      context.addIssue({
        code: "custom",
        message: "Each platform/account version must be unique",
      });
    }
  });

export const contentInput = z.object({
  internalTitle: z.string().trim().min(1).max(160),
  sourceAssetId: z.uuid(),
  platformVersions: platformVersionsInput,
});

export const contentUpdateInput = z.object({
  internalTitle: z.string().trim().min(1).max(160),
  platformVersions: platformVersionsInput,
});

export const decisionInput = z
  .object({
    revisionId: z.uuid(),
    result: z.enum(["approved", "rejected"]),
    reason: z.string().trim().max(1000).optional(),
  })
  .superRefine((value, context) => {
    if (value.result === "rejected" && !value.reason) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "A rejection reason is required",
      });
    }
  });

export function contentJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
