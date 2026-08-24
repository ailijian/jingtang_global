import { execFile, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

import {
  disposableContainerLabels,
  trackDisposableContainer,
  untrackDisposableContainer,
} from "./disposable-containers.js";

const execFileAsync = promisify(execFile);

export interface DisposablePostgres {
  readonly name: string;
  readonly adminUrl: string;
  readonly appUrl: string;
  readonly workerUrl: string;
}

async function waitForPostgres(name: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = spawnSync(
      "docker",
      ["exec", name, "pg_isready", "-U", "postgres", "-d", "jingtang"],
      {
        stdio: "ignore",
      },
    );
    if (result.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Disposable PostgreSQL did not become ready");
}

async function provisionRuntimeRoles(name: string): Promise<void> {
  const sql =
    "DO $$ BEGIN " +
    "IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jingtang_app') THEN CREATE ROLE jingtang_app LOGIN PASSWORD 'local_app_only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; END IF; " +
    "IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jingtang_worker') THEN CREATE ROLE jingtang_worker LOGIN PASSWORD 'local_worker_only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; END IF; " +
    "END $$; GRANT CONNECT ON DATABASE jingtang TO jingtang_app, jingtang_worker;";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await execFileAsync("docker", [
        "exec",
        name,
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-d",
        "jingtang",
        "-c",
        sql,
      ]);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("Could not provision the disposable PostgreSQL runtime roles");
}

export async function startDisposablePostgres(): Promise<DisposablePostgres> {
  const name = `jingtang-d2-${process.pid}-${randomUUID().slice(0, 8)}`;
  trackDisposableContainer(name);
  try {
    await execFileAsync("docker", [
      "run",
      "--detach",
      "--rm",
      "--name",
      name,
      ...disposableContainerLabels("postgres"),
      "--publish",
      "127.0.0.1::5432",
      "--env",
      "POSTGRES_DB=jingtang",
      "--env",
      "POSTGRES_PASSWORD=local_admin_only",
      "postgres:17.6-alpine",
    ]);
    await waitForPostgres(name);
    const { stdout } = await execFileAsync("docker", ["port", name, "5432/tcp"]);
    const port = stdout.trim().split(":").at(-1);
    if (!port || !/^\d+$/.test(port))
      throw new Error("Could not resolve disposable PostgreSQL port");
    await provisionRuntimeRoles(name);
    return {
      name,
      adminUrl: `postgresql://postgres:local_admin_only@127.0.0.1:${port}/jingtang?schema=public`,
      appUrl: `postgresql://jingtang_app:local_app_only@127.0.0.1:${port}/jingtang?schema=public`,
      workerUrl: `postgresql://jingtang_worker:local_worker_only@127.0.0.1:${port}/jingtang?schema=public`,
    };
  } catch (error) {
    await stopDisposablePostgres(name);
    throw error;
  }
}

export async function stopDisposablePostgres(name: string): Promise<void> {
  try {
    await execFileAsync("docker", ["stop", "--timeout", "1", name]).catch(() => undefined);
  } finally {
    untrackDisposableContainer(name);
  }
}

export function runChecked(
  command: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
): void {
  const result = spawnSync(command, args, { env: environment, stdio: "inherit" });
  if (result.status !== 0)
    throw new Error(`${command} failed with exit code ${String(result.status)}`);
}

export function spawnInherited(
  command: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
): ChildProcess {
  return spawn(command, args, { env: environment, stdio: "inherit" });
}

export function migrationEnvironment(database: DisposablePostgres): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DATABASE_ADMIN_URL: database.adminUrl,
    DATABASE_URL: database.appUrl,
    DATABASE_WORKER_URL: database.workerUrl,
  };
}

export function deployMigrations(database: DisposablePostgres): void {
  runChecked("pnpm", ["--filter", "@jingtang/db", "db:migrate"], migrationEnvironment(database));
}
