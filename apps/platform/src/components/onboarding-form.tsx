"use client";

import type { Locale } from "@jingtang/domain";
import { translate } from "@jingtang/i18n";
import { Button, FormField, StatusMessage } from "@jingtang/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

type WorkspaceOption = {
  readonly id: string;
  readonly name: string;
};

export function OnboardingForm({
  locale,
  workspaces,
}: {
  readonly locale: Locale;
  readonly workspaces: readonly WorkspaceOption[];
}) {
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

  function selectExisting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void submit("/api/v1/workspaces/select", { workspaceId: data.get("workspaceId") });
  }

  const createStep = workspaces.length ? "02" : "01";
  const joinStep = workspaces.length ? "03" : "02";

  return (
    <div className="onboarding-grid">
      {workspaces.length ? (
        <form className="onboarding-card onboarding-card--existing" onSubmit={selectExisting}>
          <span className="eyebrow">01</span>
          <h2>{t("workspace.existing.title")}</h2>
          <p>{t("workspace.existing.description")}</p>
          <label htmlFor="existing-workspace">{t("workspace.select.label")}</label>
          <select id="existing-workspace" name="workspaceId" disabled={busy} required>
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={busy}>
            {t("workspace.existing.action")}
          </Button>
        </form>
      ) : null}
      <form className="onboarding-card" onSubmit={create}>
        <span className="eyebrow">{createStep}</span>
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
        <span className="eyebrow">{joinStep}</span>
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
