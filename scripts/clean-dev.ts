import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cleanupOrphanedDisposableContainers } from "./lib/disposable-containers.js";
import { cleanupOrphanedE2ETokenVaultDirectories } from "./lib/disposable-files.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const removed: string[] = [];

function removePath(path: string): void {
  if (!existsSync(path)) return;
  rmSync(path, { recursive: true, force: true });
  removed.push(path);
}

function pruneReleasePackages(): void {
  const root = join(repositoryRoot, ".local", "review-release");
  if (!existsSync(root)) return;
  const packages = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^[0-9a-f]{40}$/.test(entry.name))
    .map((entry) => join(root, entry.name))
    .filter((directory) => {
      const marker = join(directory, "RELEASE");
      return existsSync(marker) && readFileSync(marker, "utf8").trim() === basename(directory);
    })
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);

  for (const stale of packages.slice(1)) removePath(stale);
}

function removeIncompatibleTerraformProviders(): void {
  const platformDirectory =
    process.platform === "darwin"
      ? `darwin_${process.arch === "arm64" ? "arm64" : "amd64"}`
      : process.platform === "linux"
        ? `linux_${process.arch === "arm64" ? "arm64" : "amd64"}`
        : undefined;
  if (!platformDirectory) return;

  const providersRoot = join(
    repositoryRoot,
    "infra",
    "tencent",
    "saas",
    ".terraform",
    "providers",
    "registry.terraform.io",
  );
  if (!existsSync(providersRoot)) return;

  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const child = join(directory, entry.name);
      if (/^(darwin|linux)_(amd64|arm64)$/.test(entry.name)) {
        if (entry.name !== platformDirectory) removePath(child);
      } else {
        visit(child);
      }
    }
  };
  visit(providersRoot);
}

function removeUnreferencedReviewImages(): void {
  const listing = spawnSync("docker", ["image", "ls", "--format", "{{.Repository}}|{{.Tag}}"], {
    encoding: "utf8",
  });
  if (listing.status !== 0) return;
  const references = listing.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("|"))
    .filter(
      ([repository, tag]) =>
        (repository === "jingtang-review" || repository === "jingtang-review-migration") &&
        /^[0-9a-f]{40}$/.test(tag ?? ""),
    )
    .map(([repository, tag]) => `${repository}:${tag}`);
  if (references.length === 0) return;

  const result = spawnSync("docker", ["image", "rm", ...references], { stdio: "inherit" });
  if (result.status !== 0) {
    console.warn("Some Review images remain because Docker still references them.");
  }
}

cleanupOrphanedDisposableContainers();
const tokenVaults = cleanupOrphanedE2ETokenVaultDirectories();
removed.push(...tokenVaults);
for (const relativePath of ["test-results", "playwright-report", ".DS_Store", "design/.DS_Store"]) {
  removePath(join(repositoryRoot, relativePath));
}
pruneReleasePackages();
removeIncompatibleTerraformProviders();
removeUnreferencedReviewImages();

console.log(`Development cleanup completed; removed ${String(removed.length)} filesystem paths.`);
