import type { Locale } from "@jingtang/domain";
import { translate } from "@jingtang/i18n";
import type { Metadata } from "next";

import { pageDefinitions, contactDefinitions, specialMetadata } from "./site-content";
import { getPublicSiteConfig } from "./site-config";
import { getLocalizedPath, type PageId } from "./site-routes";

function metadataKeys(pageId: PageId) {
  if (pageId in specialMetadata) return specialMetadata[pageId as keyof typeof specialMetadata];
  if (pageId === "contact" || pageId === "bookDemo") {
    const definition = contactDefinitions[pageId];
    return { title: definition.metaTitle, description: definition.metaDescription };
  }
  const definition = pageDefinitions[pageId as keyof typeof pageDefinitions];
  return { title: definition.metaTitle, description: definition.metaDescription };
}

export function getSiteMetadata(locale: Locale, pageId: PageId): Metadata {
  const config = getPublicSiteConfig();
  const keys = metadataKeys(pageId);
  const title = translate(locale, keys.title);
  const description = translate(locale, keys.description);
  const canonicalPath = getLocalizedPath(locale, pageId);
  const enPath = getLocalizedPath("en", pageId);
  const zhPath = getLocalizedPath("zh-CN", pageId);
  return {
    metadataBase: new URL(config.identity.canonical_origin),
    title: `${title} | JINGTANG`,
    description,
    alternates: {
      canonical: canonicalPath,
      languages: { en: enPath, "zh-CN": zhPath, "x-default": enPath },
    },
    openGraph: {
      type: "website",
      siteName: "JINGTANG",
      title,
      description,
      url: canonicalPath,
      locale: locale === "en" ? "en_US" : "zh_CN",
      alternateLocale: locale === "en" ? ["zh_CN"] : ["en_US"],
    },
    robots: { index: true, follow: true },
  };
}
