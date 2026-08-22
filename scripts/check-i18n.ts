import { readFile } from "node:fs/promises";
import path from "node:path";

import { glob } from "glob";

import { catalogs } from "../packages/i18n/src/index.js";

const englishKeys = Object.keys(catalogs.en);
const chineseKeys = Object.keys(catalogs["zh-CN"]);
const missingChinese = englishKeys.filter((key) => !chineseKeys.includes(key));
const missingEnglish = chineseKeys.filter((key) => !englishKeys.includes(key));
if (missingChinese.length || missingEnglish.length) {
  throw new Error(
    `Catalog key mismatch. Missing zh-CN: ${missingChinese.join(", ")}; missing en: ${missingEnglish.join(", ")}`,
  );
}

const sourceFiles = await glob(["apps/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}"], {
  ignore: [
    "**/node_modules/**",
    "**/dist/**",
    "packages/db/src/generated/**",
    "packages/i18n/src/catalogs/**",
  ],
});
const sources = (
  await Promise.all(sourceFiles.map((file) => readFile(path.resolve(file), "utf8")))
).join("\n");
const dynamicPrefixes = ["activity.action.", "activity.result."].filter((prefix) =>
  sources.includes(`\`${prefix}\${`),
);
const unused = englishKeys.filter(
  (key) =>
    !sources.includes(`"${key}"`) && !dynamicPrefixes.some((prefix) => key.startsWith(prefix)),
);
if (unused.length) throw new Error(`Unused i18n keys: ${unused.join(", ")}`);

for (const [locale, catalog] of Object.entries(catalogs)) {
  for (const [key, value] of Object.entries(catalog)) {
    if (!value.trim()) throw new Error(`${locale}.${key} is empty`);
    const placeholders = [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/g)]
      .map((match) => match[1])
      .sort();
    const englishPlaceholders = [
      ...catalogs.en[key as keyof typeof catalogs.en].matchAll(/\{([a-zA-Z0-9_]+)\}/g),
    ]
      .map((match) => match[1])
      .sort();
    if (placeholders.join(",") !== englishPlaceholders.join(",")) {
      throw new Error(`${locale}.${key} placeholder set differs from English`);
    }
  }
}

process.stdout.write(
  `i18n evidence: ${englishKeys.length} complete, non-empty, referenced keys in en and zh-CN.\n`,
);
