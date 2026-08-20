import type { Locale } from "@jingtang/domain";

import { en } from "./catalogs/en.js";
import { zhCN } from "./catalogs/zh-CN.js";

export { en, zhCN };

export type MessageKey = keyof typeof en;

export const defaultLocale: Locale = "en";
export const catalogs: Readonly<Record<Locale, Readonly<Record<MessageKey, string>>>> = {
  en,
  "zh-CN": zhCN,
};

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "zh-CN";
}

export function resolveLocale(input: {
  readonly userPreference?: string | null;
  readonly cookiePreference?: string | null;
  readonly acceptLanguage?: string | null;
}): Locale {
  if (isLocale(input.userPreference)) return input.userPreference;
  if (isLocale(input.cookiePreference)) return input.cookiePreference;
  if (input.acceptLanguage?.toLowerCase().startsWith("zh")) return "zh-CN";
  return defaultLocale;
}

export function translate(
  locale: Locale,
  key: MessageKey,
  params: Readonly<Record<string, string | number>> = {},
): string {
  const template = catalogs[locale][key] || catalogs.en[key];
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

export function formatDateTime(locale: Locale, value: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatNumber(locale: Locale, value: number): string {
  return new Intl.NumberFormat(locale).format(value);
}
