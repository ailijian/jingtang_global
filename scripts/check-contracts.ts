import { readFile } from "node:fs/promises";
import path from "node:path";

import Ajv2020 from "ajv/dist/2020.js";
import { glob } from "glob";
import { parse as parseYaml } from "yaml";

interface CatalogEntry {
  readonly id: string;
  readonly owner_stage: string;
  readonly canonical_path: string;
  readonly status: "planned" | "implemented";
}

const root = process.cwd();
const manifest = parseYaml(await readFile(path.join(root, "contracts/manifest.yaml"), "utf8")) as {
  readonly catalog: readonly CatalogEntry[];
};
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  allowUnionTypes: true,
  validateFormats: false,
});
const fixtureById: Readonly<Record<string, string>> = {
  workspace: "workspace.valid.json",
  rbac: "rbac.valid.json",
  locale_preference: "locale_preference.valid.json",
  consent: "consent.valid.json",
  channel: "channel.valid.json",
  audit_event: "audit_event.valid.json",
};

for (const entry of manifest.catalog) {
  if (entry.status !== "implemented") continue;
  const contractPath = path.join(root, entry.canonical_path);
  const source = await readFile(contractPath, "utf8");
  if (entry.canonical_path.endsWith(".json")) {
    const schema = JSON.parse(source) as Record<string, unknown>;
    if (schema["$schema"] !== "https://json-schema.org/draft/2020-12/schema") {
      throw new Error(`${entry.id} does not declare JSON Schema 2020-12`);
    }
    if (schema.additionalProperties !== false) {
      throw new Error(`${entry.id} must deny unknown fields`);
    }
    const validate = ajv.compile(schema);
    const fixtureName = fixtureById[entry.id];
    if (!fixtureName) throw new Error(`No compatibility fixture registered for ${entry.id}`);
    const fixture = JSON.parse(
      await readFile(path.join(root, "contracts/fixtures", fixtureName), "utf8"),
    ) as unknown;
    if (!validate(fixture)) {
      throw new Error(
        `${entry.id} rejected its compatibility fixture: ${ajv.errorsText(validate.errors)}`,
      );
    }
  } else {
    const document = parseYaml(source) as Record<string, unknown>;
    if (entry.id === "http_api" && document.openapi !== "3.1.0") {
      throw new Error("HTTP contract must use OpenAPI 3.1.0");
    }
    if (entry.id === "http_api") {
      const servers = document.servers as readonly { readonly url?: string }[];
      if (servers[0]?.url !== "/api/v1") throw new Error("HTTP contract must expose /api/v1");
      const paths = document.paths as Readonly<Record<string, Readonly<Record<string, unknown>>>>;
      for (const [contractRoute, operations] of Object.entries(paths)) {
        const runtimeRoute = contractRoute.replace(/\{([^}]+)\}/g, "[$1]");
        const routeSource = await readFile(
          path.join(root, "apps/platform/src/app/api/v1", runtimeRoute, "route.ts"),
          "utf8",
        );
        for (const method of Object.keys(operations).filter((key) => key !== "parameters")) {
          if (!routeSource.includes(`function ${method.toUpperCase()}(`)) {
            throw new Error(
              `${method.toUpperCase()} ${contractRoute} is missing from the runtime route`,
            );
          }
        }
      }
      const legacyRoutes = await glob("apps/platform/src/app/api/*/route.ts");
      if (legacyRoutes.length) throw new Error("Unversioned runtime API routes are prohibited");
    }
    if (entry.id === "async_api" && document.asyncapi !== "3.0.0") {
      throw new Error("Event contract must use AsyncAPI 3.0.0");
    }
  }
}

process.stdout.write("D2 contracts and compatibility fixtures are valid.\n");
