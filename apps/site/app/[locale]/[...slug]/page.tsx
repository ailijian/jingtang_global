import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicSitePage } from "../../../src/components/public-site";
import { getSiteMetadata } from "../../../src/metadata";
import {
  allPageIds,
  fromLocaleRoute,
  getPageId,
  pageSegments,
  toLocaleRoute,
} from "../../../src/site-routes";

interface SitePageProps {
  readonly params: Promise<{ locale: string; slug: string[] }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return (["en", "zh-CN"] as const).flatMap((locale) =>
    allPageIds
      .filter((pageId) => pageId !== "home")
      .map((pageId) => ({
        locale: toLocaleRoute(locale),
        slug: [...pageSegments[pageId]],
      })),
  );
}

export async function generateMetadata({ params }: SitePageProps): Promise<Metadata> {
  const { locale: routeLocale, slug } = await params;
  const locale = fromLocaleRoute(routeLocale);
  const pageId = getPageId(slug);
  if (!locale || !pageId || pageId === "home") return {};
  return getSiteMetadata(locale, pageId);
}

export default async function SitePage({ params }: SitePageProps) {
  const { locale: routeLocale, slug } = await params;
  const locale = fromLocaleRoute(routeLocale);
  const pageId = getPageId(slug);
  if (!locale || !pageId || pageId === "home") notFound();
  return <PublicSitePage locale={locale} pageId={pageId} />;
}
