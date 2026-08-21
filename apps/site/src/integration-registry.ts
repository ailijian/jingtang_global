import { readFileSync } from "node:fs";
import path from "node:path";

import { parse as parseYaml } from "yaml";

export type PublicStatus = "available" | "beta_early_access" | "coming_soon";
export type CapabilityState = "available" | "not_available";

export interface PublicIntegration {
  readonly id: string;
  readonly displayName: string;
  readonly status: PublicStatus;
  readonly productionAvailable: boolean;
  readonly capabilities: {
    readonly connect: CapabilityState;
    readonly publishNow: CapabilityState;
    readonly schedule: CapabilityState;
    readonly trackResult: CapabilityState;
  };
}

interface RegistryEntry {
  readonly display_name: string;
  readonly public_status: PublicStatus;
  readonly production_available: boolean;
  readonly capabilities: Readonly<
    Record<
      "connect" | "publish_now" | "schedule" | "track_result",
      { readonly state: CapabilityState }
    >
  >;
}

function repositoryRoot(): string {
  const cwd = process.cwd();
  return path.basename(cwd) === "site" ? path.resolve(cwd, "../..") : cwd;
}

export function getPublicIntegrations(): readonly PublicIntegration[] {
  const value = parseYaml(
    readFileSync(path.join(repositoryRoot(), "config/integrations.yaml"), "utf8"),
  ) as { readonly integrations?: Readonly<Record<string, RegistryEntry>> };
  if (!value.integrations) throw new Error("Integration Registry is missing integrations");
  return Object.entries(value.integrations).map(([id, entry]) => {
    const capabilities = Object.values(entry.capabilities ?? {});
    if (
      !["available", "beta_early_access", "coming_soon"].includes(entry.public_status) ||
      (entry.public_status === "available" && !entry.production_available) ||
      (entry.public_status === "beta_early_access" && !entry.production_available) ||
      (entry.public_status === "coming_soon" && entry.production_available) ||
      capabilities.some(
        (capability) => !["available", "not_available"].includes(capability.state),
      ) ||
      (entry.public_status === "coming_soon" &&
        capabilities.some((capability) => capability.state === "available"))
    ) {
      throw new Error(`Integration ${id} has an inconsistent public status`);
    }
    return {
      id,
      displayName: entry.display_name,
      status: entry.public_status,
      productionAvailable: entry.production_available,
      capabilities: {
        connect: entry.capabilities.connect.state,
        publishNow: entry.capabilities.publish_now.state,
        schedule: entry.capabilities.schedule.state,
        trackResult: entry.capabilities.track_result.state,
      },
    };
  });
}
