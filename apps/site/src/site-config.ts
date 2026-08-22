import { readFileSync } from "node:fs";
import path from "node:path";

import { parse as parseYaml } from "yaml";

interface PublicSiteConfig {
  readonly status: "implementation_candidate" | "production_approved" | "production";
  readonly effective_date: string;
  readonly identity: {
    readonly brand: string;
    readonly official_domain: string;
    readonly canonical_origin: string;
    readonly support_email: string;
    readonly legal_entity: { readonly en: string; readonly "zh-CN": string };
    readonly freeze: { readonly status: "approved"; readonly approved_on: string };
  };
  readonly legal: {
    readonly policy_version: string;
    readonly effective_date: string;
    readonly approval_status: "pending_human_legal_data_disclosure_approval" | "approved";
  };
  readonly contact: {
    readonly method: "email_handoff";
    readonly destination: string;
    readonly inactive_retention_days: number;
  };
  readonly product_access: {
    readonly public_status: "private_beta_prelaunch";
    readonly sign_in_action: string;
  };
  readonly production_readiness: {
    readonly domain_ownership: string;
    readonly dns: string;
    readonly tls: string;
    readonly legal_data_approval: string;
    readonly production_rollout: "blocked" | "authorized" | "deployed_verified";
  };
}

function repositoryRoot(): string {
  const cwd = process.cwd();
  return path.basename(cwd) === "site" ? path.resolve(cwd, "../..") : cwd;
}

function assertConfig(value: unknown): asserts value is PublicSiteConfig {
  if (!value || typeof value !== "object") throw new Error("Public site config is missing");
  const candidate = value as Partial<PublicSiteConfig>;
  if (
    candidate.identity?.official_domain !== "jingtangai.com" ||
    candidate.identity.canonical_origin !== "https://jingtangai.com" ||
    candidate.identity.support_email !== "developer@jingtangai.com" ||
    candidate.identity.legal_entity?.en !==
      "Jingtang (Shanghai) Intelligent Technology Co., Ltd." ||
    candidate.identity.legal_entity?.["zh-CN"] !== "鲸汤（上海）智能科技有限公司" ||
    candidate.identity.freeze?.status !== "approved" ||
    candidate.legal?.policy_version !== "2026-08-22" ||
    candidate.legal.effective_date !== "2026-08-22" ||
    candidate.contact?.method !== "email_handoff" ||
    candidate.contact.destination !== candidate.identity.support_email ||
    candidate.product_access?.public_status !== "private_beta_prelaunch"
  ) {
    throw new Error("Public site identity or legal configuration is invalid");
  }
}

let cached: PublicSiteConfig | undefined;

export function getPublicSiteConfig(): PublicSiteConfig {
  if (cached) return cached;
  const source = readFileSync(path.join(repositoryRoot(), "config/public-site.yaml"), "utf8");
  const value: unknown = parseYaml(source);
  assertConfig(value);
  cached = value;
  return value;
}
