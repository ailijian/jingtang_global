import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { compile } from "json-schema-to-typescript";
import { format } from "prettier";
import { parse as parseYaml } from "yaml";

interface CatalogEntry {
  readonly id: string;
  readonly canonical_path: string;
  readonly status: "planned" | "implemented";
}

const root = process.cwd();
const outputPath = path.join(root, "packages/domain/src/generated/contracts.ts");
const manifest = parseYaml(await readFile(path.join(root, "contracts/manifest.yaml"), "utf8")) as {
  readonly catalog: readonly CatalogEntry[];
};
const sections = ["// Generated from contracts/manifest.yaml. Do not edit by hand.\n"];

for (const entry of manifest.catalog) {
  if (entry.status !== "implemented" || !entry.canonical_path.endsWith(".json")) continue;
  const schema = JSON.parse(
    await readFile(path.join(root, entry.canonical_path), "utf8"),
  ) as Parameters<typeof compile>[0];
  sections.push(
    await compile(schema, String(schema.title ?? entry.id), {
      bannerComment: "",
      additionalProperties: false,
      format: false,
      style: { singleQuote: false, semi: true, trailingComma: "all" },
    }),
  );
}

const generated = await format(`${sections.join("\n").trim()}\n`, {
  parser: "typescript",
  printWidth: 100,
  trailingComma: "all",
});
if (process.argv.includes("--check")) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== generated)
    throw new Error("Generated contract types are stale; run pnpm contracts:generate");
} else {
  await writeFile(outputPath, generated, "utf8");
}
