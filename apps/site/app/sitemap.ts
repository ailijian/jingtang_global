import type { MetadataRoute } from "next";

import { getPublicSiteConfig } from "../src/site-config";
import { allPageIds, getLocalizedPath } from "../src/site-routes";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const config = getPublicSiteConfig();
  const lastModified = config.effective_date;
  return (["en", "zh-CN"] as const).flatMap((locale) =>
    allPageIds.map((pageId) => {
      const url = `${config.identity.canonical_origin}${getLocalizedPath(locale, pageId)}`;
      return {
        url,
        lastModified,
        changeFrequency: pageId === "home" || pageId === "integrations" ? "weekly" : "monthly",
        priority: pageId === "home" ? 1 : pageId === "privacy" || pageId === "terms" ? 0.7 : 0.8,
        alternates: {
          languages: {
            en: `${config.identity.canonical_origin}${getLocalizedPath("en", pageId)}`,
            "zh-CN": `${config.identity.canonical_origin}${getLocalizedPath("zh-CN", pageId)}`,
          },
        },
      } as const;
    }),
  );
}
