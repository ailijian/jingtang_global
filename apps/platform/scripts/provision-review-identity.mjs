/* global process */

import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute } from "node:path";

import { MockIdentityProvider } from "@jingtang/integrations";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`review_identity_${name.toLowerCase()}_required`);
  return value;
}

if (process.env.APP_ENV !== "review") throw new Error("review_identity_environment_required");
const storagePath = required("LOCAL_IDENTITY_STORE_PATH");
const passwordPath = required("REVIEW_IDENTITY_PASSWORD_FILE");
if (!isAbsolute(storagePath) || !isAbsolute(passwordPath)) {
  throw new Error("review_identity_paths_must_be_absolute");
}
const metadata = lstatSync(passwordPath);
if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0) {
  throw new Error("review_identity_password_file_invalid");
}
const password = readFileSync(passwordPath, "utf8").replace(/[\r\n]+$/u, "");
const profile = new MockIdentityProvider({
  storagePath,
  selfServiceEnabled: false,
}).provisionIdentity({
  email: required("REVIEW_IDENTITY_EMAIL"),
  name: required("REVIEW_IDENTITY_NAME"),
  password,
});
process.stdout.write(`Provisioned protected review identity: ${profile.email}\n`);
