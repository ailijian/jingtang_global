import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  ApplicationError,
  type IdentityProfile,
  type IdentityProvider,
  type SignUpResult,
} from "@jingtang/application";

interface MockRecord extends IdentityProfile {
  readonly salt: Buffer;
  passwordHash: Buffer;
  resetRequested: boolean;
}

interface StoredMockRecord extends IdentityProfile {
  readonly salt: string;
  readonly passwordHash: string;
  readonly resetRequested: boolean;
}

interface MockIdentityOptions {
  readonly storagePath?: string;
  readonly resolveExistingProfile?: (email: string) => Promise<IdentityProfile | null>;
}

export class MockIdentityProvider implements IdentityProvider {
  private readonly records = new Map<string, MockRecord>();
  private readonly storagePath: string | undefined;
  private readonly resolveExistingProfile:
    MockIdentityOptions["resolveExistingProfile"] | undefined;

  public constructor(options: MockIdentityOptions = {}) {
    this.storagePath = options.storagePath;
    this.resolveExistingProfile = options.resolveExistingProfile;
    if (!this.storagePath) return;
    try {
      const stored = JSON.parse(readFileSync(this.storagePath, "utf8")) as unknown;
      if (!Array.isArray(stored)) throw new Error("local_identity_store_invalid");
      for (const value of stored) {
        if (
          typeof value !== "object" ||
          value === null ||
          typeof (value as StoredMockRecord).subject !== "string" ||
          typeof (value as StoredMockRecord).email !== "string" ||
          typeof (value as StoredMockRecord).name !== "string" ||
          typeof (value as StoredMockRecord).salt !== "string" ||
          typeof (value as StoredMockRecord).passwordHash !== "string" ||
          typeof (value as StoredMockRecord).resetRequested !== "boolean"
        ) {
          throw new Error("local_identity_store_invalid");
        }
        const entry = value as StoredMockRecord;
        this.records.set(entry.email, {
          subject: entry.subject,
          email: entry.email,
          name: entry.name,
          salt: Buffer.from(entry.salt, "base64"),
          passwordHash: Buffer.from(entry.passwordHash, "base64"),
          resetRequested: entry.resetRequested,
        });
      }
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
      throw error;
    }
  }

  private persist(): void {
    if (!this.storagePath) return;
    const stored: StoredMockRecord[] = [...this.records.values()].map((entry) => ({
      subject: entry.subject,
      email: entry.email,
      name: entry.name,
      salt: entry.salt.toString("base64"),
      passwordHash: entry.passwordHash.toString("base64"),
      resetRequested: entry.resetRequested,
    }));
    mkdirSync(dirname(this.storagePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.storagePath}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(stored)}\n`, { mode: 0o600 });
    renameSync(temporaryPath, this.storagePath);
  }

  public signUp(input: {
    readonly email: string;
    readonly password: string;
    readonly name: string;
  }): Promise<SignUpResult> {
    const email = input.email.trim().toLowerCase();
    if (this.records.has(email))
      throw new ApplicationError("conflict", "Account already exists", 409);
    const salt = randomBytes(16);
    const subject = `mock_${randomBytes(16).toString("hex")}`;
    this.records.set(email, {
      subject,
      email,
      name: input.name.trim(),
      salt,
      passwordHash: scryptSync(input.password, salt, 64),
      resetRequested: false,
    });
    this.persist();
    return Promise.resolve({ subject, confirmed: true });
  }

  public confirmSignUp(): Promise<void> {
    return Promise.resolve();
  }

  public authenticate(input: {
    readonly email: string;
    readonly password: string;
  }): Promise<IdentityProfile> {
    const record = this.records.get(input.email.trim().toLowerCase());
    if (!record) throw new ApplicationError("authentication_failed", "Invalid credentials", 401);
    const candidate = scryptSync(input.password, record.salt, 64);
    if (!timingSafeEqual(candidate, record.passwordHash)) {
      throw new ApplicationError("authentication_failed", "Invalid credentials", 401);
    }
    return Promise.resolve({ subject: record.subject, email: record.email, name: record.name });
  }

  public async requestPasswordReset(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    let record = this.records.get(normalizedEmail);
    if (!record && this.resolveExistingProfile) {
      const profile = await this.resolveExistingProfile(normalizedEmail);
      if (profile) {
        const salt = randomBytes(16);
        record = {
          ...profile,
          email: normalizedEmail,
          salt,
          passwordHash: scryptSync(randomBytes(32), salt, 64),
          resetRequested: true,
        };
        this.records.set(normalizedEmail, record);
      }
    }
    if (record) {
      record.resetRequested = true;
      this.persist();
    }
  }

  public confirmPasswordReset(input: {
    readonly email: string;
    readonly code: string;
    readonly newPassword: string;
  }): Promise<void> {
    const record = this.records.get(input.email.trim().toLowerCase());
    if (!record || !record.resetRequested || input.code !== "000000") {
      throw new ApplicationError("invalid_input", "Invalid or expired reset code", 400);
    }
    record.passwordHash = scryptSync(input.newPassword, record.salt, 64);
    record.resetRequested = false;
    this.persist();
    return Promise.resolve();
  }

  public deleteAccount(input: { readonly email: string; readonly subject: string }): Promise<void> {
    const email = input.email.trim().toLowerCase();
    const record = this.records.get(email);
    if (record && record.subject === input.subject) {
      this.records.delete(email);
      this.persist();
    }
    return Promise.resolve();
  }
}
