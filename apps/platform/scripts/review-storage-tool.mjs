/* global Buffer, process */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  closeSync,
  createReadStream,
  createWriteStream,
  lstatSync,
  openSync,
  readSync,
  statSync,
} from "node:fs";
import { appendFile, unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { loadRuntimeSecretFiles } from "@jingtang/integrations";

const formatMagic = Buffer.from("JTBK1", "ascii");
const ivLength = 12;
const tagLength = 16;

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`review_storage_tool_${name.toLowerCase()}_required`);
  return value;
}

function protectedFile(path) {
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0) {
    throw new Error("review_storage_tool_secret_file_invalid");
  }
  return path;
}

function encryptionKey() {
  const path = protectedFile(required("REVIEW_BACKUP_ENCRYPTION_KEY_FILE"));
  const descriptor = openSync(path, "r");
  try {
    const length = statSync(path).size;
    if (length < 43 || length > 128) throw new Error("review_backup_encryption_key_invalid");
    const raw = Buffer.alloc(length);
    readSync(descriptor, raw, 0, length, 0);
    const key = Buffer.from(raw.toString("utf8").trim(), "base64");
    if (key.length !== 32) throw new Error("review_backup_encryption_key_invalid");
    return key;
  } finally {
    closeSync(descriptor);
  }
}

function client() {
  loadRuntimeSecretFiles(process.env, "platform");
  return new S3Client({
    endpoint: required("OBJECT_STORAGE_ENDPOINT"),
    region: required("OBJECT_STORAGE_REGION"),
    forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: required("OBJECT_STORAGE_ACCESS_KEY_ID"),
      secretAccessKey: required("OBJECT_STORAGE_SECRET_ACCESS_KEY"),
    },
  });
}

async function encrypt(input, output) {
  const iv = randomBytes(ivLength);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const destination = createWriteStream(output, { flags: "wx", mode: 0o600 });
  destination.write(Buffer.concat([formatMagic, iv]));
  try {
    await pipeline(createReadStream(input), cipher, destination);
    await appendFile(output, cipher.getAuthTag(), { mode: 0o600 });
  } catch (error) {
    await unlink(output).catch(() => undefined);
    throw error;
  }
}

async function decrypt(input, output) {
  const size = statSync(input).size;
  if (size <= formatMagic.length + ivLength + tagLength) {
    throw new Error("review_backup_ciphertext_invalid");
  }
  const descriptor = openSync(input, "r");
  const header = Buffer.alloc(formatMagic.length + ivLength);
  const tag = Buffer.alloc(tagLength);
  try {
    readSync(descriptor, header, 0, header.length, 0);
    readSync(descriptor, tag, 0, tag.length, size - tagLength);
  } finally {
    closeSync(descriptor);
  }
  if (!header.subarray(0, formatMagic.length).equals(formatMagic)) {
    throw new Error("review_backup_ciphertext_invalid");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    header.subarray(formatMagic.length),
  );
  decipher.setAuthTag(tag);
  try {
    await pipeline(
      createReadStream(input, {
        start: header.length,
        end: size - tagLength - 1,
      }),
      decipher,
      createWriteStream(output, { flags: "wx", mode: 0o600 }),
    );
  } catch (error) {
    await unlink(output).catch(() => undefined);
    throw error;
  }
}

async function backup() {
  const input = required("REVIEW_BACKUP_INPUT");
  const encrypted = required("REVIEW_BACKUP_OUTPUT");
  const objectKey = required("REVIEW_BACKUP_OBJECT_KEY");
  if (!objectKey.startsWith("backups/postgres/") || !objectKey.endsWith(".dump.enc")) {
    throw new Error("review_backup_object_key_invalid");
  }
  await encrypt(input, encrypted);
  const storage = client();
  const size = statSync(encrypted).size;
  await storage.send(
    new PutObjectCommand({
      Bucket: required("OBJECT_STORAGE_BUCKET"),
      Key: objectKey,
      Body: createReadStream(encrypted),
      ContentLength: size,
      ContentType: "application/octet-stream",
      Metadata: { "jingtang-backup-format": "JTBK1-AES-256-GCM" },
    }),
  );
  process.stdout.write(`${objectKey}\n`);
}

async function download() {
  const encrypted = required("REVIEW_BACKUP_INPUT");
  const output = required("REVIEW_BACKUP_OUTPUT");
  const objectKey = required("REVIEW_BACKUP_OBJECT_KEY");
  if (!objectKey.startsWith("backups/postgres/") || !objectKey.endsWith(".dump.enc")) {
    throw new Error("review_backup_object_key_invalid");
  }
  const result = await client().send(
    new GetObjectCommand({ Bucket: required("OBJECT_STORAGE_BUCKET"), Key: objectKey }),
  );
  if (!result.Body) throw new Error("review_backup_body_missing");
  await pipeline(
    Readable.fromWeb(result.Body.transformToWebStream()),
    createWriteStream(encrypted, { flags: "wx", mode: 0o600 }),
  );
  await decrypt(encrypted, output);
}

async function bytesUnder(prefix) {
  const storage = client();
  let continuationToken;
  let bytes = 0;
  let objects = 0;
  do {
    const result = await storage.send(
      new ListObjectsV2Command({
        Bucket: required("OBJECT_STORAGE_BUCKET"),
        Prefix: prefix,
        ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
      }),
    );
    for (const object of result.Contents ?? []) {
      bytes += object.Size ?? 0;
      objects += 1;
    }
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
    if (result.IsTruncated && !continuationToken) {
      throw new Error("review_storage_continuation_missing");
    }
  } while (continuationToken);
  return { bytes, objects };
}

async function capacity() {
  const [active, backups] = await Promise.all([
    bytesUnder("workspaces/"),
    bytesUnder("backups/postgres/"),
  ]);
  const activeLimit = 15 * 1024 ** 3;
  const backupBudget = 3 * 1024 ** 3;
  process.stdout.write(
    `${JSON.stringify({ active, backups, active_limit_bytes: activeLimit, backup_budget_bytes: backupBudget })}\n`,
  );
  if (active.bytes >= activeLimit || backups.bytes >= backupBudget) process.exitCode = 2;
}

if (process.env.APP_ENV !== "review") throw new Error("review_storage_tool_profile_required");
const operation = process.argv[2];
if (operation === "backup") await backup();
else if (operation === "download") await download();
else if (operation === "capacity") await capacity();
else throw new Error("review_storage_tool_operation_invalid");
