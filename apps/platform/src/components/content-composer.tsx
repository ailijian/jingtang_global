"use client";

import type { Locale } from "@jingtang/domain";
import { translate } from "@jingtang/i18n";
import { Button, StatusMessage } from "@jingtang/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface DraftState {
  readonly step: number;
  readonly asset: {
    readonly id: string;
    readonly filename: string;
    readonly byteSize: number;
  } | null;
  readonly accountReference: string;
  readonly accountDisplayName: string;
  readonly internalTitle: string;
  readonly platformTitle: string;
  readonly description: string;
  readonly privacyStatus: "private" | "unlisted" | "public";
  readonly madeForKids: boolean;
}

const initial: DraftState = {
  step: 1,
  asset: null,
  accountReference: "youtube-review-target",
  accountDisplayName: "",
  internalTitle: "",
  platformTitle: "",
  description: "",
  privacyStatus: "private",
  madeForKids: false,
};

export function ContentComposer({
  locale,
  workspaceId,
}: {
  readonly locale: Locale;
  readonly workspaceId: string;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const storageKey = `jingtang:d4-content-composer:${workspaceId}`;
  const router = useRouter();
  const [draft, setDraft] = useState<DraftState>(initial);
  const [file, setFile] = useState<File | null>(null);
  const [ownership, setOwnership] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<"ready" | "upload_failed" | "save_failed" | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        try {
          setDraft({ ...initial, ...(JSON.parse(saved) as Partial<DraftState>) });
        } catch {
          sessionStorage.removeItem(storageKey);
        }
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    sessionStorage.setItem(storageKey, JSON.stringify(draft));
  }, [draft, hydrated, storageKey]);

  function update<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function uploadAsset() {
    if (!file || !ownership) return;
    setBusy(true);
    setMessage(null);
    try {
      const body = new FormData();
      body.set("asset", file);
      body.set("ownershipConfirmed", "true");
      const response = await fetch("/api/v1/content/assets", { method: "POST", body });
      if (!response.ok) {
        setMessage("upload_failed");
        return;
      }
      const payload = (await response.json()) as {
        asset_id: string;
        filename: string;
        byte_size: number;
      };
      setDraft((current) => ({
        ...current,
        asset: { id: payload.asset_id, filename: payload.filename, byteSize: payload.byte_size },
        step: 2,
      }));
      setMessage("ready");
    } catch {
      setMessage("upload_failed");
    } finally {
      setBusy(false);
    }
  }

  const platformsReady = draft.accountReference.trim() && draft.accountDisplayName.trim();
  const customizeReady = draft.internalTitle.trim() && draft.platformTitle.trim();

  async function save(submit: boolean) {
    if (!draft.asset || !platformsReady || !customizeReady) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/content", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          internalTitle: draft.internalTitle,
          sourceAssetId: draft.asset.id,
          platformVersions: [
            {
              platform: "youtube",
              accountReference: draft.accountReference,
              accountDisplayName: draft.accountDisplayName,
              title: draft.platformTitle,
              description: draft.description,
              privacyStatus: draft.privacyStatus,
              madeForKids: draft.madeForKids,
            },
          ],
        }),
      });
      if (!response.ok) {
        setMessage("save_failed");
        return;
      }
      const payload = (await response.json()) as { content_id: string };
      if (submit) {
        const submission = await fetch(`/api/v1/content/${payload.content_id}/submit`, {
          method: "POST",
        });
        if (!submission.ok) {
          setMessage("save_failed");
          router.push(`/app/content/${payload.content_id}`);
          return;
        }
      }
      sessionStorage.removeItem(storageKey);
      router.push(`/app/content/${payload.content_id}`);
      router.refresh();
    } catch {
      setMessage("save_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="composer-shell">
      <ol className="composer-steps" aria-label={t("composer.title")}>
        {[
          t("composer.step.content"),
          t("composer.step.platforms"),
          t("composer.step.customize"),
          t("composer.step.review"),
        ].map((label, index) => (
          <li key={label} aria-current={draft.step === index + 1 ? "step" : undefined}>
            <span>{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <div className="composer-workspace">
        <form className="composer-form" onSubmit={(event) => event.preventDefault()}>
          {draft.step === 1 ? (
            <section className="composer-section">
              <h2>{t("composer.asset.title")}</h2>
              <p>{t("composer.asset.help")}</p>
              <label className="content-field">
                <span>{t("composer.asset.select")}</span>
                <input
                  name="sourceAsset"
                  type="file"
                  accept="video/mp4,video/quicktime,image/jpeg,image/png,image/webp"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <label className="ownership-row">
                <input
                  name="ownershipConfirmed"
                  type="checkbox"
                  checked={ownership}
                  onChange={(event) => setOwnership(event.target.checked)}
                />
                <span>{t("composer.asset.ownership")}</span>
              </label>
              <Button disabled={!file || !ownership || busy} onClick={() => void uploadAsset()}>
                {busy ? t("composer.asset.uploading") : t("composer.asset.upload")}
              </Button>
            </section>
          ) : null}

          {draft.step === 2 ? (
            <section className="composer-section">
              <h2>{t("composer.platform.title")}</h2>
              <article className="platform-choice platform-choice--active">
                <strong>{t("composer.platform.youtube")}</strong>
                <p>{t("composer.platform.youtube.help")}</p>
              </article>
              <div className="field-grid">
                <label className="content-field">
                  <span>{t("composer.platform.accountReference")}</span>
                  <input
                    name="accountReference"
                    value={draft.accountReference}
                    maxLength={255}
                    onChange={(event) => update("accountReference", event.target.value)}
                  />
                </label>
                <label className="content-field">
                  <span>{t("composer.platform.accountName")}</span>
                  <input
                    name="accountDisplayName"
                    value={draft.accountDisplayName}
                    maxLength={255}
                    onChange={(event) => update("accountDisplayName", event.target.value)}
                  />
                </label>
              </div>
              <div className="platform-coming-soon">
                <span>Facebook · {t("composer.platform.comingSoon")}</span>
                <span>Instagram · {t("composer.platform.comingSoon")}</span>
                <small>{t("composer.platform.noAction")}</small>
              </div>
            </section>
          ) : null}

          {draft.step === 3 ? (
            <section className="composer-section">
              <h2>{t("composer.customize.title")}</h2>
              <label className="content-field">
                <span>{t("composer.internalTitle")}</span>
                <input
                  name="internalTitle"
                  value={draft.internalTitle}
                  maxLength={160}
                  onChange={(event) => update("internalTitle", event.target.value)}
                />
              </label>
              <label className="content-field">
                <span>{t("composer.youtubeTitle")}</span>
                <input
                  name="platformTitle"
                  value={draft.platformTitle}
                  maxLength={100}
                  onChange={(event) => update("platformTitle", event.target.value)}
                />
              </label>
              <label className="content-field">
                <span>{t("composer.descriptionField")}</span>
                <textarea
                  name="description"
                  value={draft.description}
                  maxLength={5000}
                  rows={7}
                  onChange={(event) => update("description", event.target.value)}
                />
              </label>
              <div className="field-grid">
                <label className="content-field">
                  <span>{t("composer.privacy")}</span>
                  <select
                    name="privacyStatus"
                    value={draft.privacyStatus}
                    onChange={(event) =>
                      update("privacyStatus", event.target.value as DraftState["privacyStatus"])
                    }
                  >
                    <option value="private">{t("composer.privacy.private")}</option>
                    <option value="unlisted">{t("composer.privacy.unlisted")}</option>
                    <option value="public">{t("composer.privacy.public")}</option>
                  </select>
                </label>
                <label className="content-field">
                  <span>{t("composer.audience")}</span>
                  <select
                    name="madeForKids"
                    value={String(draft.madeForKids)}
                    onChange={(event) => update("madeForKids", event.target.value === "true")}
                  >
                    <option value="false">{t("composer.notMadeForKids")}</option>
                    <option value="true">{t("composer.madeForKids")}</option>
                  </select>
                </label>
              </div>
            </section>
          ) : null}

          {draft.step === 4 ? (
            <section className="composer-section">
              <h2>{t("composer.review.title")}</h2>
              <StatusMessage tone="info">{t("composer.review.note")}</StatusMessage>
              <dl className="review-list">
                <div>
                  <dt>{t("composer.asset.title")}</dt>
                  <dd>{draft.asset?.filename}</dd>
                </div>
                <div>
                  <dt>{t("composer.platform.accountName")}</dt>
                  <dd>{draft.accountDisplayName}</dd>
                </div>
                <div>
                  <dt>{t("detail.revision")}</dt>
                  <dd>1</dd>
                </div>
              </dl>
              <div className="capability-notes">
                <span>{t("composer.schedule")}</span>
                <span>{t("composer.ai")}</span>
              </div>
            </section>
          ) : null}

          {message === "ready" ? (
            <StatusMessage tone="success">{t("composer.asset.ready")}</StatusMessage>
          ) : null}
          {message === "upload_failed" ? (
            <StatusMessage tone="danger">{t("composer.asset.failed")}</StatusMessage>
          ) : null}
          {message === "save_failed" ? (
            <StatusMessage tone="danger">{t("composer.failed")}</StatusMessage>
          ) : null}

          {draft.step > 1 ? (
            <div className="composer-actions">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => update("step", draft.step - 1)}
              >
                {t("composer.back")}
              </Button>
              {draft.step < 4 ? (
                <Button
                  disabled={busy || (draft.step === 2 ? !platformsReady : !customizeReady)}
                  onClick={() => update("step", draft.step + 1)}
                >
                  {t("composer.continue")}
                </Button>
              ) : (
                <>
                  <Button variant="secondary" disabled={busy} onClick={() => void save(false)}>
                    {busy ? t("composer.saving") : t("composer.saveDraft")}
                  </Button>
                  <Button disabled={busy} onClick={() => void save(true)}>
                    {busy ? t("composer.saving") : t("composer.submit")}
                  </Button>
                </>
              )}
            </div>
          ) : null}
        </form>

        {draft.step >= 3 ? (
          <aside className="platform-preview" aria-label={t("composer.preview")}>
            <p>{t("composer.preview")}</p>
            <div className="preview-frame" aria-hidden="true">
              <span>16:9</span>
            </div>
            <strong>{draft.platformTitle || t("composer.youtubeTitle")}</strong>
            <small>{draft.accountDisplayName || t("composer.platform.youtube")}</small>
            <p>{draft.description || t("composer.preview.noDescription")}</p>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
