import "@jingtang/ui/styles.css";
import "../site.css";

import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { fromLocaleRoute } from "../../src/site-routes";

export default async function LocaleRootLayout({
  children,
  params,
}: {
  readonly children: ReactNode;
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale: routeLocale } = await params;
  const locale = fromLocaleRoute(routeLocale);
  if (!locale) notFound();
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
