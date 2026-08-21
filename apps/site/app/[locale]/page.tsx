import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicSitePage } from "../../src/components/public-site";
import { getSiteMetadata } from "../../src/metadata";
import { fromLocaleRoute } from "../../src/site-routes";

interface LocaleHomeProps {
  readonly params: Promise<{ locale: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ locale: "en" }, { locale: "zh-cn" }];
}

export async function generateMetadata({ params }: LocaleHomeProps): Promise<Metadata> {
  const { locale: routeLocale } = await params;
  const locale = fromLocaleRoute(routeLocale);
  return locale ? getSiteMetadata(locale, "home") : {};
}

export default async function LocaleHome({ params }: LocaleHomeProps) {
  const { locale: routeLocale } = await params;
  const locale = fromLocaleRoute(routeLocale);
  if (!locale) notFound();
  return <PublicSitePage locale={locale} pageId="home" />;
}
