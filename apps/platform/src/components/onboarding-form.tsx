"use client";

import type { Locale } from "@jingtang/domain";
import { translate } from "@jingtang/i18n";
import { Button, FormField, StatusMessage } from "@jingtang/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

export function OnboardingForm({ locale }: { locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const router = useRouter();
  const token = useSearchParams().get("invite") ?? "";
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(path: string, payload: object) {
    setBusy(true);
    setError(undefined);
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setError(t("member.failed"));
      setBusy(false);
      return;
    }
    router.push("/app");
    router.refresh();
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void submit("/api/v1/workspaces", { name: data.get("name") });
  }

  return (
    <div className="onboarding-grid">
      <form className="onboarding-card" onSubmit={create}>
        <span className="eyebrow">01</span>
        <h2>{t("workspace.create.title")}</h2>
        <p>{t("workspace.create.description")}</p>
        <FormField
          id="workspace-name"
          name="name"
          required
          minLength={2}
          label={t("workspace.name")}
        />
        <Button type="submit" disabled={busy}>
          {t("workspace.create.action")}
        </Button>
      </form>
      <section className="onboarding-card">
        <span className="eyebrow">02</span>
        <h2>{t("auth.invite.title")}</h2>
        <p>{t("workspace.join.description")}</p>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !token}
          onClick={() => void submit("/api/v1/invitations/accept", { token })}
        >
          {t("workspace.join.action")}
        </Button>
      </section>
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}
    </div>
  );
}
