import type { MetadataRoute } from "next";

import { getPublicSiteConfig } from "../src/site-config";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  const config = getPublicSiteConfig();
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${config.identity.canonical_origin}/sitemap.xml`,
    host: config.identity.canonical_origin,
  };
}
