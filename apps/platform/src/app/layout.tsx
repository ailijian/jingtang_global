import "@jingtang/ui/styles.css";
import "./platform.css";

import { translate } from "@jingtang/i18n";
import type { Metadata } from "next";
import Link from "next/link";

import { LocalePicker } from "../components/locale-picker";
import { FormStateRestorer } from "../components/form-state-restorer";
import { pageLocale } from "../server/locale";

export const metadata: Metadata = {
  title: "JINGTANG Workspace",
  description: "Controlled cross-border publishing workspace",
  robots: { index: false, follow: false, noarchive: true },
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await pageLocale();
  return (
    <html lang={locale}>
      <body>
        <FormStateRestorer />
        <a className="skip-link" href="#main-content">
          {translate(locale, "app.skipToContent")}
        </a>
        <header className="global-header">
          <Link className="wordmark" href="/">
            {translate(locale, "app.brand")}
            <span>GLOBAL</span>
          </Link>
          <LocalePicker
            locale={locale}
            enLabel={translate(locale, "locale.en")}
            zhLabel={translate(locale, "locale.zhCN")}
          />
        </header>
        {children}
      </body>
    </html>
  );
}
