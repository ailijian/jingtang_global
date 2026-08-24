import { spawnSync } from "node:child_process";

const activeContainers = new Set<string>();
let exitHookInstalled = false;
let signalHooksInstalled = false;

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function cleanupOrphanedDisposableContainers(): void {
  const result = spawnSync(
    "docker",
    [
      "ps",
      "--filter",
      "label=com.jingtang.disposable=true",
      "--format",
      '{{.Names}}\t{{.Label "com.jingtang.disposable.owner-pid"}}',
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0 || !result.stdout) return;

  for (const line of result.stdout.trim().split("\n")) {
    if (!line) continue;
    const [name, ownerPidText] = line.split("\t");
    const ownerPid = Number(ownerPidText);
    if (!name || (Number.isSafeInteger(ownerPid) && ownerPid > 0 && isProcessAlive(ownerPid))) {
      continue;
    }
    spawnSync("docker", ["stop", "--timeout", "1", name], { stdio: "ignore" });
  }
}

function stopActiveContainersSynchronously(): void {
  const names = [...activeContainers];
  activeContainers.clear();
  for (const name of names) {
    spawnSync("docker", ["stop", "--timeout", "1", name], { stdio: "ignore" });
  }
}

export function trackDisposableContainer(name: string): void {
  activeContainers.add(name);
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.once("exit", stopActiveContainersSynchronously);
}

export function untrackDisposableContainer(name: string): void {
  activeContainers.delete(name);
}

export function installDisposableContainerSignalHandlers(): void {
  if (signalHooksInstalled) return;
  signalHooksInstalled = true;
  cleanupOrphanedDisposableContainers();
  process.once("SIGHUP", () => process.exit(129));
  process.once("SIGINT", () => process.exit(130));
  process.once("SIGTERM", () => process.exit(143));
}

export function disposableContainerLabels(kind: "postgres" | "object-storage"): string[] {
  return [
    "--label",
    "com.jingtang.disposable=true",
    "--label",
    `com.jingtang.disposable.kind=${kind}`,
    "--label",
    `com.jingtang.disposable.owner-pid=${String(process.pid)}`,
  ];
}
