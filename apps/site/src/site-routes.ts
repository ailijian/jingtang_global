import type { Locale } from "@jingtang/domain";

export type SiteLocaleRoute = "en" | "zh-cn";
export type PageId =
  | "home"
  | "socialPublishing"
  | "workflowApprovals"
  | "integrations"
  | "youtube"
  | "solutions"
  | "security"
  | "about"
  | "contact"
  | "privacy"
  | "terms"
  | "dataDeletion"
  | "signIn"
  | "bookDemo";

export const allPageIds: readonly PageId[] = [
  "home",
  "socialPublishing",
  "workflowApprovals",
  "integrations",
  "youtube",
  "solutions",
  "security",
  "about",
  "contact",
  "privacy",
  "terms",
  "dataDeletion",
  "signIn",
  "bookDemo",
];

export const pageSegments: Readonly<Record<PageId, readonly string[]>> = {
  home: [],
  socialPublishing: ["platform", "social-publishing"],
  workflowApprovals: ["platform", "workflow-approvals"],
  integrations: ["integrations"],
  youtube: ["integrations", "youtube"],
  solutions: ["solutions"],
  security: ["security"],
  about: ["company", "about"],
  contact: ["company", "contact"],
  privacy: ["privacy"],
  terms: ["terms"],
  dataDeletion: ["data-deletion"],
  signIn: ["sign-in"],
  bookDemo: ["book-demo"],
};

export function toLocaleRoute(locale: Locale): SiteLocaleRoute {
  return locale === "zh-CN" ? "zh-cn" : "en";
}

export function fromLocaleRoute(value: string): Locale | undefined {
  if (value === "en") return "en";
  if (value === "zh-cn") return "zh-CN";
  return undefined;
}

export function getPageId(segments: readonly string[] | undefined): PageId | undefined {
  const candidate = (segments ?? []).join("/");
  return allPageIds.find((pageId) => pageSegments[pageId].join("/") === candidate);
}

export function getLocalizedPath(locale: Locale, pageId: PageId): string {
  const suffix = pageSegments[pageId].join("/");
  return `/${toLocaleRoute(locale)}/${suffix}${suffix ? "/" : ""}`;
}

export function getAlternatePath(locale: Locale, pageId: PageId): string {
  return getLocalizedPath(locale === "en" ? "zh-CN" : "en", pageId);
}
