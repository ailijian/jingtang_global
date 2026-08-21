"use client";

import type { Locale } from "@jingtang/domain";
import Link from "next/link";
import type { MouseEvent } from "react";

export function LocaleSwitcher({
  locale,
  alternatePath,
  label,
}: {
  readonly locale: Locale;
  readonly alternatePath: string;
  readonly label: string;
}) {
  function switchLocale(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    const nextLocale = locale === "en" ? "zh-CN" : "en";
    document.cookie = `jingtang_locale=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
    localStorage.setItem("jingtang_locale", nextLocale);
    window.location.assign(`${alternatePath}${window.location.search}${window.location.hash}`);
  }

  return (
    <Link
      className="site-locale"
      href={alternatePath}
      hrefLang={locale === "en" ? "zh-CN" : "en"}
      onClick={switchLocale}
    >
      <span aria-hidden="true">{locale === "en" ? "中文" : "EN"}</span>
      <span className="site-visually-hidden">{label}</span>
    </Link>
  );
}
