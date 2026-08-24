import {
  ApplicationError,
  type AppConfig,
  type IdentityDeletionProvider,
  type IdentityProfile,
  type IdentityProvider,
  type SignUpResult,
} from "@jingtang/application";
import { ciam } from "tencentcloud-sdk-nodejs-ciam";

import { createTencentCredential } from "./tencent-cloud-credentials.js";

export interface CiamAdminClient {
  DeleteUsers(input: {
    readonly UserStoreId: string;
    readonly UserIds: readonly string[];
  }): Promise<unknown>;
}

export class TencentCiamIdentityDeletionProvider implements IdentityDeletionProvider {
  readonly #userStoreId: string;
  readonly #admin: CiamAdminClient;

  public constructor(input: { readonly userStoreId: string; readonly admin: CiamAdminClient }) {
    this.#userStoreId = input.userStoreId;
    this.#admin = input.admin;
  }

  public async deleteAccount(input: {
    readonly email: string;
    readonly subject: string;
  }): Promise<void> {
    try {
      await this.#admin.DeleteUsers({
        UserStoreId: this.#userStoreId,
        UserIds: [input.subject],
      });
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code)
          : error instanceof Error
            ? error.name
            : "";
      if (/User(NotExist|NotFound)/iu.test(code)) return;
      throw new ApplicationError("service_unavailable", "Identity deletion is unavailable", 503);
    }
  }
}

interface CiamErrorBody {
  readonly error?: string;
  readonly error_description?: string;
}

interface CiamChallenge {
  readonly v: 1;
  readonly purpose: "signup" | "reset_password";
  readonly email: string;
  readonly otpToken: string;
}

type Fetch = typeof globalThis.fetch;

function normalizeIssuer(issuer: string): string {
  const parsed = new URL(issuer);
  if (parsed.protocol !== "https:") throw new Error("ciam_issuer_https_required");
  parsed.pathname = parsed.pathname.replace(/\/$/u, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/u, "");
}

function encodeChallenge(value: CiamChallenge): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeChallenge(
  value: string | undefined,
  purpose: CiamChallenge["purpose"],
): CiamChallenge {
  try {
    if (!value) throw new Error("missing");
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as
      Partial<CiamChallenge> | undefined;
    if (
      !parsed ||
      parsed.v !== 1 ||
      parsed.purpose !== purpose ||
      typeof parsed.email !== "string" ||
      typeof parsed.otpToken !== "string"
    ) {
      throw new Error("invalid");
    }
    return parsed as CiamChallenge;
  } catch {
    throw new ApplicationError("invalid_input", "Identity challenge is invalid or expired", 400);
  }
}

export class TencentCiamIdentityProvider implements IdentityProvider {
  readonly #issuer: string;
  readonly #basicAuthorization: string;
  readonly #clientId: string;
  readonly #clientSecret: string;
  readonly #passwordAuthSourceId: string;
  readonly #userStoreId: string;
  readonly #admin: CiamAdminClient;
  readonly #fetch: Fetch;

  public constructor(input: {
    readonly issuer: string;
    readonly clientId: string;
    readonly clientSecret: string;
    readonly passwordAuthSourceId: string;
    readonly userStoreId: string;
    readonly admin: CiamAdminClient;
    readonly fetch?: Fetch;
  }) {
    this.#issuer = normalizeIssuer(input.issuer);
    this.#clientId = input.clientId;
    this.#clientSecret = input.clientSecret;
    this.#passwordAuthSourceId = input.passwordAuthSourceId;
    this.#userStoreId = input.userStoreId;
    this.#admin = input.admin;
    this.#fetch = input.fetch ?? globalThis.fetch;
    const credentials = `${encodeURIComponent(input.clientId)}:${encodeURIComponent(input.clientSecret)}`;
    this.#basicAuthorization = `Basic ${Buffer.from(credentials, "utf8").toString("base64")}`;
  }

  async #requestJson<T>(
    path: string,
    init: RequestInit,
    authorization = this.#basicAuthorization,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await this.#fetch(`${this.#issuer}${path}`, {
        ...init,
        redirect: "error",
        signal: controller.signal,
        headers: {
          accept: "application/json",
          ...(authorization ? { authorization } : {}),
          ...init.headers,
        },
      });
      const body = (await response.json().catch(() => ({}))) as T & CiamErrorBody;
      if (!response.ok) throw this.#mapError(response.status, body);
      return body;
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError("service_unavailable", "Identity service is unavailable", 503);
    } finally {
      clearTimeout(timeout);
    }
  }

  #mapError(status: number, body: CiamErrorBody): ApplicationError {
    const code = body.error ?? "unknown_error";
    if (["duplicate_email", "email_is_used"].includes(code)) {
      return new ApplicationError("conflict", "Account already exists", 409);
    }
    if (
      [
        "bad_email_otp",
        "bad_email_otp_token",
        "invalid_grant",
        "invalid_password",
        "invalid_new_password",
        "recurrent_password",
      ].includes(code)
    ) {
      return new ApplicationError(
        "invalid_input",
        "Credentials or confirmation code rejected",
        400,
      );
    }
    if (code === "user_not_found") {
      return new ApplicationError("not_found", "Identity was not found", 404);
    }
    if (code === "temporarily_unavailable" || status >= 500) {
      return new ApplicationError("service_unavailable", "Identity service is unavailable", 503);
    }
    if (code.includes("rate_limit") || code.includes("quota")) {
      return new ApplicationError("rate_limited", "Try again later", 429);
    }
    if (status === 401 || status === 403 || code === "abnormal_user_status") {
      return new ApplicationError("authentication_failed", "Invalid credentials", 401);
    }
    return new ApplicationError("invalid_input", "Identity request was rejected", 400);
  }

  public async signUp(input: {
    readonly email: string;
    readonly password: string;
    readonly name: string;
  }): Promise<SignUpResult> {
    const email = input.email.trim().toLowerCase();
    const result = await this.#requestJson<{ readonly otp_token?: string }>("/otp/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ usage: "signup", email }),
    });
    if (!result.otp_token) {
      throw new ApplicationError("service_unavailable", "Identity service is unavailable", 503);
    }
    return {
      confirmed: false,
      challenge: encodeChallenge({
        v: 1,
        purpose: "signup",
        email,
        otpToken: result.otp_token,
      }),
    };
  }

  public async confirmSignUp(input: {
    readonly email: string;
    readonly code: string;
    readonly password?: string;
    readonly name?: string;
    readonly challenge?: string;
  }): Promise<IdentityProfile> {
    const challenge = decodeChallenge(input.challenge, "signup");
    const email = input.email.trim().toLowerCase();
    if (challenge.email !== email || !input.password || !input.name?.trim()) {
      throw new ApplicationError("invalid_input", "Identity challenge is invalid or expired", 400);
    }
    let result: { readonly sub?: string };
    try {
      result = await this.#requestJson<{ readonly sub?: string }>("/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          email_otp_token: challenge.otpToken,
          email_otp: input.code,
          password: input.password,
          nickname: input.name?.trim(),
        }),
      });
    } catch (error) {
      if (error instanceof ApplicationError && error.code === "conflict") {
        return this.authenticate({ email, password: input.password });
      }
      throw error;
    }
    if (!result.sub) {
      throw new ApplicationError("service_unavailable", "Identity service is unavailable", 503);
    }
    return { subject: result.sub, email, name: input.name.trim() };
  }

  public async authenticate(input: {
    readonly email: string;
    readonly password: string;
  }): Promise<IdentityProfile> {
    const body = new URLSearchParams({
      grant_type: "password",
      client_id: this.#clientId,
      client_secret: this.#clientSecret,
      auth_source_id: this.#passwordAuthSourceId,
      username: input.email.trim().toLowerCase(),
      password: input.password,
      scope: "openid",
    });
    const token = await this.#requestJson<{ readonly access_token?: string }>(
      "/oauth2/token",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      },
      "",
    );
    if (!token.access_token) {
      throw new ApplicationError("authentication_failed", "Invalid credentials", 401);
    }
    const profile = await this.#requestJson<Partial<IdentityProfile> & { sub?: unknown }>(
      "/userinfo",
      { method: "GET" },
      `Bearer ${token.access_token}`,
    );
    let subject: string;
    if (typeof profile.subject === "string") {
      subject = profile.subject;
    } else if (typeof profile.sub === "string") {
      subject = profile.sub;
    } else {
      throw new ApplicationError("service_unavailable", "Identity profile is incomplete", 503);
    }
    if (typeof profile.email !== "string") {
      throw new ApplicationError("service_unavailable", "Identity profile is incomplete", 503);
    }
    const name =
      typeof profile.name === "string" && profile.name.trim().length > 0
        ? profile.name
        : (profile.email.split("@")[0] ?? profile.email);
    return { subject, email: profile.email, name };
  }

  public async requestPasswordReset(emailInput: string): Promise<{ readonly challenge?: string }> {
    const email = emailInput.trim().toLowerCase();
    try {
      const result = await this.#requestJson<{ readonly otp_token?: string }>("/otp/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ usage: "reset_password", email }),
      });
      return result.otp_token
        ? {
            challenge: encodeChallenge({
              v: 1,
              purpose: "reset_password",
              email,
              otpToken: result.otp_token,
            }),
          }
        : {};
    } catch (error) {
      if (
        error instanceof ApplicationError &&
        !["rate_limited", "service_unavailable"].includes(error.code)
      ) {
        return {};
      }
      throw error;
    }
  }

  public async confirmPasswordReset(input: {
    readonly email: string;
    readonly code: string;
    readonly newPassword: string;
    readonly challenge?: string;
  }): Promise<void> {
    const challenge = decodeChallenge(input.challenge, "reset_password");
    const email = input.email.trim().toLowerCase();
    if (challenge.email !== email) {
      throw new ApplicationError("invalid_input", "Identity challenge is invalid or expired", 400);
    }
    await this.#requestJson("/reset_user_password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        password: input.newPassword,
        email,
        email_otp_token: challenge.otpToken,
        email_otp: input.code,
      }),
    });
  }

  public async deleteAccount(input: {
    readonly email: string;
    readonly subject: string;
  }): Promise<void> {
    try {
      await this.#admin.DeleteUsers({
        UserStoreId: this.#userStoreId,
        UserIds: [input.subject],
      });
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code)
          : error instanceof Error
            ? error.name
            : "";
      if (/User(NotExist|NotFound)/iu.test(code)) return;
      throw new ApplicationError("service_unavailable", "Identity deletion is unavailable", 503);
    }
  }
}

function createTencentCiamAdminClient(config: AppConfig): CiamAdminClient {
  const AdminClient = ciam.v20220331.Client;
  return new AdminClient({
    credential: createTencentCredential(config),
    region: config.TENCENT_KMS_REGION,
    profile: {
      httpProfile: {
        reqMethod: "POST",
        reqTimeout: 30,
        endpoint: "ciam.tencentcloudapi.com",
      },
    },
  });
}

export function createTencentCiamIdentityDeletionProvider(
  config: AppConfig,
): TencentCiamIdentityDeletionProvider {
  return new TencentCiamIdentityDeletionProvider({
    userStoreId: config.CIAM_USER_STORE_ID ?? "",
    admin: createTencentCiamAdminClient(config),
  });
}

export function createTencentCiamIdentityProvider(config: AppConfig): TencentCiamIdentityProvider {
  return new TencentCiamIdentityProvider({
    issuer: config.CIAM_ISSUER ?? "",
    clientId: config.CIAM_CLIENT_ID ?? "",
    clientSecret: config.CIAM_CLIENT_SECRET ?? "",
    passwordAuthSourceId: config.CIAM_PASSWORD_AUTH_SOURCE_ID ?? "",
    userStoreId: config.CIAM_USER_STORE_ID ?? "",
    admin: createTencentCiamAdminClient(config),
  });
}
