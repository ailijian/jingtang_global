"use client";

import type { Locale } from "@jingtang/domain";
import { translate } from "@jingtang/i18n";
import { Button, FormField, StatusMessage } from "@jingtang/ui";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

type Mode = "signup" | "login" | "confirm" | "reset";
type AuthFormProps =
  | {
      readonly mode: "signup";
      readonly locale: Locale;
      readonly policyLinks: { readonly terms: string; readonly privacy: string };
    }
  | {
      readonly mode: Exclude<Mode, "signup">;
      readonly locale: Locale;
      readonly policyLinks?: never;
    };

export function AuthForm({ mode, locale, policyLinks }: AuthFormProps) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [resetRequested, setResetRequested] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(undefined);
    const data = new FormData(event.currentTarget);
    const rawEmail = data.get("email");
    const email = typeof rawEmail === "string" ? rawEmail : "";
    const payload: Record<string, unknown> = { email };
    let endpoint = `/api/v1/auth/${mode}`;
    if (mode === "signup") {
      Object.assign(payload, {
        name: data.get("name"),
        password: data.get("password"),
        consent: data.get("consent") === "on",
        locale,
      });
    } else if (mode === "login") {
      payload.password = data.get("password");
    } else if (mode === "confirm") {
      payload.code = data.get("code");
    } else if (!resetRequested) {
      endpoint = "/api/v1/auth/password/request";
    } else {
      endpoint = "/api/v1/auth/password/confirm";
      payload.code = data.get("code");
      payload.newPassword = data.get("newPassword");
    }
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json()) as {
      confirmation_required?: boolean;
      error?: { code?: string };
    };
    if (!response.ok) {
      if (body.error?.code === "confirmation_required") {
        router.push(`/confirm?email=${encodeURIComponent(email)}`);
        return;
      }
      setMessage(t("auth.error.generic"));
      setBusy(false);
      return;
    }
    if (mode === "signup" && body.confirmation_required) {
      router.push(`/confirm?email=${encodeURIComponent(email)}`);
    } else if (mode === "confirm") {
      router.push(`/login?email=${encodeURIComponent(email)}`);
    } else if (mode === "reset" && !resetRequested) {
      setResetRequested(true);
      setMessage(t("auth.reset.sent"));
      setBusy(false);
    } else if (mode === "reset") {
      router.push(`/login?email=${encodeURIComponent(email)}`);
    } else {
      router.push(mode === "login" && body ? "/app" : "/onboarding");
      router.refresh();
    }
  }

  const action =
    mode === "signup"
      ? t("auth.signUp.action")
      : mode === "login"
        ? t("auth.login.action")
        : mode === "confirm"
          ? t("auth.confirm.action")
          : resetRequested
            ? t("auth.reset.confirm")
            : t("auth.reset.request");

  return (
    <form className="auth-form" onSubmit={(event) => void submit(event)}>
      <FormField
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={searchParams.get("email") ?? ""}
        required
        label={t("auth.email")}
      />
      {mode === "signup" ? (
        <FormField id="name" name="name" autoComplete="name" required label={t("auth.name")} />
      ) : null}
      {mode === "signup" || mode === "login" ? (
        <FormField
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={mode === "signup" ? 12 : 1}
          required
          label={t("auth.password")}
        />
      ) : null}
      {mode === "confirm" || (mode === "reset" && resetRequested) ? (
        <FormField
          id="code"
          name="code"
          inputMode="numeric"
          required
          label={t("auth.confirmationCode")}
        />
      ) : null}
      {mode === "reset" && resetRequested ? (
        <FormField
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          label={t("auth.newPassword")}
        />
      ) : null}
      {mode === "signup" ? (
        <label className="consent-row">
          <input name="consent" type="checkbox" required />
          <span>
            {t("consent.prefix")} <a href={policyLinks.terms}>{t("consent.terms")}</a>{" "}
            {t("consent.and")} <a href={policyLinks.privacy}>{t("consent.privacy")}</a>.
          </span>
        </label>
      ) : null}
      {message ? (
        <StatusMessage tone={resetRequested ? "info" : "danger"}>{message}</StatusMessage>
      ) : null}
      <Button type="submit" disabled={busy}>
        {action}
      </Button>
      {mode === "login" ? <Link href="/reset-password">{t("auth.reset.request")}</Link> : null}
      {mode === "signup" ? (
        <p>
          {t("auth.account.existing")} <Link href="/login">{t("auth.login.action")}</Link>
        </p>
      ) : null}
      {mode === "login" ? (
        <p>
          {t("auth.account.new")} <Link href="/signup">{t("auth.signUp.action")}</Link>
        </p>
      ) : null}
    </form>
  );
}
