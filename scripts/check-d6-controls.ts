import { readFile } from "node:fs/promises";

const security = await readFile("docs/security-and-data/README.md", "utf8");
const operations = await readFile("docs/OPERATIONS.md", "utf8");
const domain = await readFile("packages/domain/src/types.ts", "utf8");
const lifecycle = await readFile("packages/db/src/lifecycle-repository.ts", "utf8");
const schema = await readFile("packages/db/prisma/schema.prisma", "utf8");
const auditImplementation = (
  await Promise.all(
    [
      "apps/platform/src/app/api/v1/auth/login/route.ts",
      "packages/db/src/repository.ts",
      "packages/db/src/content-repository.ts",
      "packages/db/src/publishing-repository.ts",
      "packages/db/src/lifecycle-repository.ts",
    ].map((file) => readFile(file, "utf8")),
  )
).join("\n");
const english = await readFile("packages/i18n/src/catalogs/en.ts", "utf8");
const chinese = await readFile("packages/i18n/src/catalogs/zh-CN.ts", "utf8");

const failures: string[] = [];
for (const [name, value] of [
  ["security/data authority", security],
  ["operations authority", operations],
] as const) {
  if (/\bTBD\b/u.test(value)) failures.push(`${name} contains an unresolved TBD`);
}

const auditCoverage = [
  "identity.login",
  "member.invited",
  "member.role_changed",
  "channel.connected",
  "channel.reauthorization_required",
  "channel.disconnected",
  "content.created",
  "content.edited",
  "content.submitted",
  "content.approved",
  "content.rejected",
  "publishing.confirmed",
  "platform.publish_cancelled",
  "platform.published",
  "platform.publish_failed",
  "data.deletion_completed",
] as const;
for (const action of auditCoverage) {
  if (!domain.includes(`"${action}"`)) failures.push(`AC-11 audit vocabulary missing ${action}`);
  if (!auditImplementation.includes(`"${action}"`)) {
    failures.push(`AC-11 audit emission missing ${action}`);
  }
}

for (const field of [
  "occurredAt",
  "workspaceId",
  "actorUserId",
  "action",
  "targetType",
  "targetId",
  "result",
  "correlationId",
  "metadata",
]) {
  if (!schema.includes(field)) failures.push(`AC-11 audit schema missing ${field}`);
}

for (const marker of [
  "prepareYouTubeDisconnect",
  "completeYouTubeDisconnect",
  "listPendingYouTubeDisconnects",
  "listExpiredYouTubeAuthorizations",
  "recordExpiredAuthorizedDataDeletion",
  "completeWorkspaceDataDeletion",
  "pseudonymize_workspace_audit",
  "operationLeaseUntil",
]) {
  if (!lifecycle.includes(marker)) failures.push(`D6 lifecycle implementation missing ${marker}`);
}

for (const [name, catalog] of [
  ["English", english],
  ["Simplified Chinese", chinese],
] as const) {
  for (const key of [
    "channel.disconnect.effectThirdParty",
    "channel.result.disconnectFailed",
    "dataSettings.workspace.effectThirdParty",
    "dataSettings.result.completed",
  ]) {
    if (!catalog.includes(`"${key}"`)) failures.push(`${name} catalog missing ${key}`);
  }
}

if (failures.length) throw new Error(`D6 control checks failed:\n${failures.join("\n")}`);
process.stdout.write(
  "D6 control evidence: authorities resolved, audit vocabulary covered, lifecycle controls present, and bilingual destructive semantics aligned.\n",
);
