import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface DisposableObjectStorage {
  readonly name: string;
  readonly endpoint: string;
}

export async function startDisposableObjectStorage(): Promise<DisposableObjectStorage> {
  const name = `jingtang-d4-storage-${process.pid}-${randomUUID().slice(0, 8)}`;
  await execFileAsync("docker", [
    "run",
    "--detach",
    "--rm",
    "--name",
    name,
    "--publish",
    "127.0.0.1::9000",
    "--env",
    "MINIO_ROOT_USER=jingtang_test",
    "--env",
    "MINIO_ROOT_PASSWORD=test_storage_only_change_me",
    "minio/minio:RELEASE.2025-04-22T22-12-26Z",
    "server",
    "/data",
  ]);
  try {
    const { stdout } = await execFileAsync("docker", ["port", name, "9000/tcp"]);
    const port = stdout.trim().split(":").at(-1);
    if (!port || !/^\d+$/.test(port)) throw new Error("Could not resolve MinIO port");
    const endpoint = `http://127.0.0.1:${port}`;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const response = await fetch(`${endpoint}/minio/health/ready`);
        if (response.ok) return { name, endpoint };
      } catch {
        // Container is still starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("Disposable object storage did not become ready");
  } catch (error) {
    await stopDisposableObjectStorage(name);
    throw error;
  }
}

export async function stopDisposableObjectStorage(name: string): Promise<void> {
  await execFileAsync("docker", ["stop", "--time", "1", name]).catch(() => undefined);
}

export function objectStorageEnvironment(storage: DisposableObjectStorage): NodeJS.ProcessEnv {
  return {
    OBJECT_STORAGE_ENDPOINT: storage.endpoint,
    OBJECT_STORAGE_REGION: "ap-southeast-1",
    OBJECT_STORAGE_BUCKET: "jingtang-test-assets",
    OBJECT_STORAGE_ACCESS_KEY_ID: "jingtang_test",
    OBJECT_STORAGE_SECRET_ACCESS_KEY: "test_storage_only_change_me",
    OBJECT_STORAGE_FORCE_PATH_STYLE: "true",
    OBJECT_STORAGE_AUTO_CREATE_BUCKET: "true",
    OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION: "false",
    MAX_SOURCE_ASSET_BYTES: "25000000",
  };
}
