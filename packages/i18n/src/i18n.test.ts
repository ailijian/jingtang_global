import { describe, expect, it } from "vitest";

import { catalogs, formatDateTime, formatNumber, resolveLocale, translate } from "./index.js";

describe("locale contract", () => {
  it("keeps catalog keys complete in both locales", () => {
    expect(Object.keys(catalogs.en).sort()).toEqual(Object.keys(catalogs["zh-CN"]).sort());
  });

  it("uses authenticated preference before local and header values", () => {
    expect(
      resolveLocale({
        userPreference: "zh-CN",
        cookiePreference: "en",
        acceptLanguage: "en-US",
      }),
    ).toBe("zh-CN");
  });

  it("falls back safely to English", () => {
    expect(resolveLocale({ acceptLanguage: "fr-FR" })).toBe("en");
    expect(translate("en", "state.empty")).toBe("No items yet");
  });

  it("formats values without changing stored values", () => {
    const stored = 1234;
    expect(formatNumber("en", stored)).toMatch(/1.?234/);
    expect(formatDateTime("en", "2026-08-21T00:00:00.000Z", "Asia/Shanghai")).not.toBe(
      formatDateTime("zh-CN", "2026-08-21T00:00:00.000Z", "Asia/Shanghai"),
    );
    expect(stored).toBe(1234);
  });

  it("resolves the same locale for SSR and hydration inputs", () => {
    const input = { userPreference: null, cookiePreference: "zh-CN", acceptLanguage: "en-US" };
    expect(resolveLocale(input)).toBe(resolveLocale({ ...input }));
  });
});
