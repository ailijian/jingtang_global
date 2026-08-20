import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

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

export class MockIdentityProvider implements IdentityProvider {
  private readonly records = new Map<string, MockRecord>();

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

  public requestPasswordReset(email: string): Promise<void> {
    const record = this.records.get(email.trim().toLowerCase());
    if (record) record.resetRequested = true;
    return Promise.resolve();
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
    return Promise.resolve();
  }
}
