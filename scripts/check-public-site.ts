import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { parse as parseYaml } from "yaml";

import { extractPublicCopy } from "./lib/public-site-copy.js";
import { requireCoherentProductionLegalRollout } from "./lib/public-site-rollout.js";

interface SiteConfig {
  readonly status: string;
  readonly identity: {
    readonly official_domain: string;
    readonly canonical_origin: string;
    readonly support_email: string;
    readonly legal_entity: { readonly en: string; readonly "zh-CN": string };
    readonly freeze: { readonly status: string };
  };
  readonly legal: {
    readonly approval_status: string;
    readonly policy_version: string;
    readonly deployment_status: string;
  };
  readonly product_access: {
    readonly public_status: string;
    readonly sign_in_action: string;
    readonly sign_in_url: string;
    readonly access_mode: string;
    readonly self_service_registration: string;
  };
  readonly production_readiness: Readonly<Record<string, string>>;
}

interface IntegrationEntry {
  readonly public_status: "available" | "beta_early_access" | "coming_soon";
  readonly production_available: boolean;
  readonly capabilities: Readonly<
    Record<string, { readonly state: "available" | "not_available" }>
  >;
}

const root = process.cwd();
const siteConfig = parseYaml(
  await readFile(path.join(root, "config/public-site.yaml"), "utf8"),
) as SiteConfig;
const registry = parseYaml(await readFile(path.join(root, "config/integrations.yaml"), "utf8")) as {
  readonly integrations: Readonly<Record<string, IntegrationEntry>>;
};
const productionCheck = process.argv.includes("--production");

if (
  siteConfig.identity.official_domain !== "jingtangai.com" ||
  siteConfig.identity.canonical_origin !== "https://jingtangai.com" ||
  siteConfig.identity.support_email !== "developer@jingtangai.com" ||
  siteConfig.identity.legal_entity.en !== "Jingtang (Shanghai) Intelligent Technology Co., Ltd." ||
  siteConfig.identity.legal_entity["zh-CN"] !== "鲸汤（上海）智能科技有限公司" ||
  siteConfig.identity.freeze.status !== "approved" ||
  siteConfig.product_access.public_status !== "authorized_access" ||
  siteConfig.product_access.sign_in_action !== "direct_to_current_saas" ||
  siteConfig.product_access.sign_in_url !== "https://review.jingtangai.com/login" ||
  siteConfig.product_access.access_mode !== "precreated_accounts_only" ||
  siteConfig.product_access.self_service_registration !== "disabled"
) {
  throw new Error("Public identity or current SaaS access does not match the approved values");
}

for (const [id, integration] of Object.entries(registry.integrations)) {
  if (integration.public_status === "available" && !integration.production_available) {
    throw new Error(`${id} cannot be Available without production availability`);
  }
  if (integration.public_status === "coming_soon") {
    if (integration.production_available)
      throw new Error(`${id} Coming Soon cannot be production available`);
    const executable = Object.entries(integration.capabilities).filter(
      ([, capability]) => capability.state === "available",
    );
    if (executable.length) throw new Error(`${id} Coming Soon exposes executable capabilities`);
  }
}

if (productionCheck) {
  const productionLegalRollout =
    siteConfig.status === "production"
      ? requireCoherentProductionLegalRollout({
          deploymentStatus: siteConfig.legal.deployment_status,
          policyRollout: siteConfig.production_readiness.legal_policy_rollout,
        })
      : undefined;
  const required = {
    config_status: siteConfig.status,
    legal_approval: siteConfig.legal.approval_status,
    legal_deployment: siteConfig.legal.deployment_status,
    domain_ownership: siteConfig.production_readiness.domain_ownership,
    dns: siteConfig.production_readiness.dns,
    tls: siteConfig.production_readiness.tls,
    legal_data_approval: siteConfig.production_readiness.legal_data_approval,
    rollout: siteConfig.production_readiness.production_rollout,
    legal_policy_rollout: siteConfig.production_readiness.legal_policy_rollout,
    product_access_rollout: siteConfig.production_readiness.product_access_rollout,
  };
  const expected =
    siteConfig.status === "production"
      ? {
          config_status: "production",
          legal_approval: "approved",
          legal_deployment: productionLegalRollout,
          domain_ownership: "verified",
          dns: "deployed_verified",
          tls: "verified",
          legal_data_approval: "approved",
          rollout: "deployed_verified",
          legal_policy_rollout: productionLegalRollout,
          product_access_rollout: "deployed_verified",
        }
      : {
          config_status: "production_approved",
          legal_approval: "approved",
          legal_deployment: "approved_pending_production_change_authorization",
          domain_ownership: "verified",
          dns: "authorized",
          tls: "pending_production_deployment_evidence",
          legal_data_approval: "approved",
          rollout: "authorized",
          legal_policy_rollout: "pending_production_change_authorization",
          product_access_rollout: "pending_production_change_authorization",
        };
  const blocked = Object.entries(required).filter(
    ([key, value]) => value !== expected[key as keyof typeof expected],
  );
  if (blocked.length) {
    throw new Error(
      `Production rollout remains blocked: ${blocked.map(([key, value]) => `${key}=${value}`).join(", ")}`,
    );
  }
}

const routes = [
  "",
  "platform/social-publishing",
  "platform/workflow-approvals",
  "integrations",
  "integrations/youtube",
  "solutions",
  "security",
  "company/about",
  "company/contact",
  "privacy",
  "terms",
  "data-deletion",
  "sign-in",
  "book-demo",
] as const;
const out = path.join(root, "apps/site/out");
await stat(path.join(out, "index.html"));
const prohibitedCopy = [
  "Website foundation",
  "Legal entity expression pending",
  "example.invalid",
  "Connect now",
  "Publish now",
  "Private Beta",
  "private-beta",
  "pre-launch",
  "Review Environment",
  "REVIEW ENVIRONMENT",
  "TEST INTEGRATION",
  "current Delivery",
  "applicable Gates",
  "D3",
  "D6",
  "D7",
  "私有测试",
  "预发布",
  "审核环境",
  "测试账号",
  "当前 Delivery",
  "适用 Gate",
];

for (const locale of ["en", "zh-cn"] as const) {
  for (const route of routes) {
    const file = path.join(out, locale, route, "index.html");
    const html = await readFile(file, "utf8");
    const publicCopy = extractPublicCopy(html);
    const language = locale === "en" ? "en" : "zh-CN";
    const suffix = route ? `${route}/` : "";
    const canonical = `${siteConfig.identity.canonical_origin}/${locale}/${suffix}`;
    const alternateLocale = locale === "en" ? "zh-cn" : "en";
    const alternateLanguage = locale === "en" ? "zh-CN" : "en";
    const alternate = `${siteConfig.identity.canonical_origin}/${alternateLocale}/${suffix}`;
    for (const expected of [
      `<html lang="${language}">`,
      `<link rel="canonical" href="${canonical}"`,
      `<link rel="alternate" hrefLang="${alternateLanguage}" href="${alternate}"`,
      `<link rel="alternate" hrefLang="x-default" href="${siteConfig.identity.canonical_origin}/en/${suffix}"`,
    ]) {
      if (!html.includes(expected)) throw new Error(`${file} is missing ${expected}`);
    }
    for (const prohibited of prohibitedCopy) {
      if (publicCopy.includes(prohibited))
        throw new Error(`${file} renders prohibited copy: ${prohibited}`);
    }
    if (!html.includes(`href="${siteConfig.product_access.sign_in_url}"`)) {
      throw new Error(`${file} does not link Sign in to the approved current SaaS`);
    }
    if (html.includes('href="/api/') || html.includes('href="/connect')) {
      throw new Error(`${file} exposes an unavailable executable integration action`);
    }
  }
}

const rootHtml = await readFile(path.join(out, "index.html"), "utf8");
if (
  !rootHtml.includes('<html lang="en">') ||
  !rootHtml.includes('href="https://jingtangai.com/en/"')
) {
  throw new Error("Root route must render English with /en/ as canonical");
}
const sitemap = await readFile(path.join(out, "sitemap.xml"), "utf8");
for (const locale of ["en", "zh-cn"] as const) {
  for (const route of routes) {
    const suffix = route ? `${route}/` : "";
    const url = `${siteConfig.identity.canonical_origin}/${locale}/${suffix}`;
    if (!sitemap.includes(url)) throw new Error(`Sitemap is missing ${url}`);
  }
}

process.stdout.write(
  `Public-site evidence: ${routes.length * 2} localized routes, current SaaS sign-in, registry gating, identity, formal content, metadata, alternates, sitemap, and ${productionCheck ? "production" : "candidate"} readiness are valid.\n`,
);
