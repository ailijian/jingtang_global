import { resolveLocale, translate, type MessageKey } from "@jingtang/i18n";
import { cookies, headers } from "next/headers";

import { pageSession } from "./auth";

export async function pageLocale() {
  const [session, cookieStore, headerStore] = await Promise.all([
    pageSession(),
    cookies(),
    headers(),
  ]);
  return resolveLocale({
    userPreference: session?.user.locale ?? null,
    cookiePreference: cookieStore.get("jt_locale")?.value ?? null,
    acceptLanguage: headerStore.get("accept-language"),
  });
}

export async function pageTranslator(): Promise<(key: MessageKey) => string> {
  const locale = await pageLocale();
  return (key) => translate(locale, key);
}
