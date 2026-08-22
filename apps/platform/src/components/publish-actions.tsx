"use client";

import type { Locale } from "@jingtang/domain";
import { translate } from "@jingtang/i18n";
import { Button, StatusMessage } from "@jingtang/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function PublishActions({
  locale,
  contentId,
  revisionId,
  canPublish,
  hasExecution,
  polling,
  sourceFilename,
  title,
  description,
  channel,
  madeForKids,
}: {
  readonly locale: Locale;
  readonly contentId: string;
  readonly revisionId: string;
  readonly canPublish: boolean;
  readonly hasExecution: boolean;
  readonly polling: boolean;
  readonly sourceFilename: string;
  readonly title: string;
  readonly description: string;
  readonly channel: string;
  readonly madeForKids: boolean;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<"queued" | "failed" | null>(null);

  useEffect(() => {
    if (!polling) return;
    const timer = window.setInterval(() => router.refresh(), 3_000);
    return () => window.clearInterval(timer);
  }, [polling, router]);

  async function publish() {
    if (!confirmed || busy || hasExecution) return;
    setBusy(true);
    setMessage(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch(`/api/v1/content/${contentId}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          revisionId,
          idempotencyKey: idempotencyKey.current,
          confirmed: true,
        }),
      });
      if (!response.ok) {
        setMessage("failed");
        return;
      }
      setMessage("queued");
      router.refresh();
    } catch {
      setMessage("failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="publish-confirmation">
      <aside
        className="platform-preview publish-confirmation-preview"
        aria-label={t("composer.preview")}
      >
        <p>{t("composer.preview")}</p>
        <div className="preview-frame" aria-hidden="true">
          <span>16:9</span>
        </div>
        <strong>{title}</strong>
        <small>{channel}</small>
        <p>{description || t("composer.preview.noDescription")}</p>
      </aside>
      <dl className="review-list">
        <div>
          <dt>{t("detail.publish.video")}</dt>
          <dd>{sourceFilename}</dd>
        </div>
        <div>
          <dt>{t("composer.youtubeTitle")}</dt>
          <dd>{title}</dd>
        </div>
        <div>
          <dt>{t("composer.descriptionField")}</dt>
          <dd>{description || t("composer.preview.noDescription")}</dd>
        </div>
        <div>
          <dt>{t("composer.platform.connectedChannel")}</dt>
          <dd>{channel}</dd>
        </div>
        <div>
          <dt>{t("composer.privacy")}</dt>
          <dd>{t("composer.privacy.private")}</dd>
        </div>
        <div>
          <dt>{t("composer.audience")}</dt>
          <dd>{t(madeForKids ? "composer.madeForKids" : "composer.notMadeForKids")}</dd>
        </div>
        <div>
          <dt>{t("detail.publish.mode")}</dt>
          <dd>{t("detail.publish.mode.now")}</dd>
        </div>
      </dl>
      {!hasExecution ? (
        <>
          <label className="ownership-row">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={!canPublish || busy}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>{t("detail.publish.confirmation")}</span>
          </label>
          <Button disabled={!canPublish || !confirmed || busy} onClick={() => void publish()}>
            {busy ? t("detail.publish.working") : t("detail.publish.action")}
          </Button>
        </>
      ) : null}
      {!canPublish && !hasExecution ? (
        <StatusMessage tone="danger">{t("detail.publish.notAllowed")}</StatusMessage>
      ) : null}
      {message === "queued" && !hasExecution ? (
        <StatusMessage tone="success">{t("detail.publish.queued")}</StatusMessage>
      ) : null}
      {message === "failed" ? (
        <StatusMessage tone="danger">{t("detail.publish.failed")}</StatusMessage>
      ) : null}
    </div>
  );
}
