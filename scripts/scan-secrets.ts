import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean)
  .filter(
    (file) =>
      !file.startsWith("pnpm-lock.yaml") && !file.includes("/generated/") && !file.endsWith(".png"),
  );

const signatures = [
  { name: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{32,}\b/ },
  { name: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { name: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
];

const findings: string[] = [];
for (const file of files) {
  let content: string;
  try {
    content = await readFile(file, "utf8");
  } catch {
    continue;
  }
  for (const signature of signatures) {
    if (signature.pattern.test(content)) findings.push(`${file}: ${signature.name}`);
  }
}
if (findings.length) throw new Error(`Potential secrets found:\n${findings.join("\n")}`);
process.stdout.write(
  `Secret scan evidence: ${files.length} repository files checked; no credential signatures found.\n`,
);
