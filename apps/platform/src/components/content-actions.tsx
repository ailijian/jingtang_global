"use client";

import type { ContentStatus, Locale, PrivacyStatus } from "@jingtang/domain";
import { translate } from "@jingtang/i18n";
import { Button, StatusMessage } from "@jingtang/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface VersionInput {
  readonly platform: "youtube" | "facebook" | "tiktok";
  readonly accountReference: string;
  readonly accountDisplayName: string;
  readonly title: string;
  readonly description: string;
  readonly privacyStatus: PrivacyStatus;
  readonly madeForKids: boolean;
}

export function ContentActions({
  locale,
  contentId,
  revisionId,
  status,
  internalTitle: initialInternalTitle,
  version,
  canEdit,
  canSubmit,
  canApprove,
  canReject,
  requiresChannelReselection,
  currentChannel,
}: {
  readonly locale: Locale;
  readonly contentId: string;
  readonly revisionId: string;
  readonly status: ContentStatus;
  readonly internalTitle: string;
  readonly version: VersionInput;
  readonly canEdit: boolean;
  readonly canSubmit: boolean;
  readonly canApprove: boolean;
  readonly canReject: boolean;
  readonly requiresChannelReselection: boolean;
  readonly currentChannel?: Pick<VersionInput, "accountReference" | "accountDisplayName">;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [editing, setEditing] = useState(false);
  const [internalTitle, setInternalTitle] = useState(initialInternalTitle);
  const [draftVersion, setDraftVersion] = useState(version);
  const [result, setResult] = useState<"saved" | "failed" | null>(null);

  async function command(path: string, body?: unknown) {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        ...(body
          ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
          : {}),
      });
      if (!response.ok) {
        setResult("failed");
        return;
      }
      setResult("saved");
      router.refresh();
    } catch {
      setResult("failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch(`/api/v1/content/${contentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ internalTitle, platformVersions: [draftVersion] }),
      });
      if (!response.ok) {
        setResult("failed");
        return;
      }
      setEditing(false);
      setResult("saved");
      router.refresh();
    } catch {
      setResult("failed");
    } finally {
      setBusy(false);
    }
  }

  function startEditing() {
    if (requiresChannelReselection && currentChannel) {
      setDraftVersion((current) => ({ ...current, ...currentChannel }));
    }
    setEditing((value) => !value);
  }

  return (
    <section className="content-action-panel">
      {status === "draft" && canSubmit ? (
        <Button disabled={busy} onClick={() => void command(`/api/v1/content/${contentId}/submit`)}>
          {t("detail.submit")}
        </Button>
      ) : null}

      {status === "pending_approval" && (canApprove || canReject) ? (
        <div className="approval-controls">
          <label className="content-field">
            <span>{t("detail.rejectReason")}</span>
            <textarea
              name="reviewFeedback"
              value={feedback}
              maxLength={1000}
              rows={4}
              onChange={(event) => setFeedback(event.target.value)}
            />
          </label>
          <div className="content-action-row">
            {canReject ? (
              <Button
                variant="danger"
                disabled={busy || !feedback.trim()}
                onClick={() =>
                  void command(`/api/v1/content/${contentId}/decision`, {
                    revisionId,
                    result: "rejected",
                    reason: feedback,
                  })
                }
              >
                {t("detail.reject")}
              </Button>
            ) : null}
            {canApprove ? (
              <Button
                disabled={busy}
                onClick={() =>
                  void command(`/api/v1/content/${contentId}/decision`, {
                    revisionId,
                    result: "approved",
                    ...(feedback.trim() ? { reason: feedback } : {}),
                  })
                }
              >
                {t("detail.approve")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {status !== "pending_approval" && canEdit ? (
        <>
          {!requiresChannelReselection || currentChannel ? (
            <Button variant="secondary" onClick={startEditing}>
              {requiresChannelReselection
                ? t("detail.publish.createRevisionForCurrentChannel")
                : t("detail.edit")}
            </Button>
          ) : (
            <p>
              {t(
                version.platform === "tiktok"
                  ? "detail.publish.tiktok.connectBeforeRevision"
                  : "detail.publish.connectBeforeRevision",
              )}{" "}
              <Link href="/app/channels">{t("detail.publish.reviewChannel")}</Link>
            </p>
          )}
          {editing ? (
            <form className="revision-edit-form" onSubmit={(event) => event.preventDefault()}>
              <label className="content-field">
                <span>{t("composer.internalTitle")}</span>
                <input
                  name="editInternalTitle"
                  value={internalTitle}
                  maxLength={160}
                  onChange={(event) => setInternalTitle(event.target.value)}
                />
              </label>
              <label className="content-field">
                <span>
                  {draftVersion.platform === "youtube"
                    ? t("composer.youtubeTitle")
                    : draftVersion.platform === "facebook" && locale === "zh-CN"
                      ? "Facebook 视频标题"
                      : draftVersion.platform === "facebook"
                        ? "Facebook video title"
                        : locale === "zh-CN"
                          ? "TikTok 标题/说明"
                          : "TikTok title/caption"}
                </span>
                <input
                  name="editPlatformTitle"
                  value={draftVersion.title}
                  maxLength={draftVersion.platform === "tiktok" ? 2200 : 100}
                  onChange={(event) =>
                    setDraftVersion((current) => ({ ...current, title: event.target.value }))
                  }
                />
              </label>
              <label className="content-field">
                <span>{t("composer.descriptionField")}</span>
                <textarea
                  name="editDescription"
                  value={draftVersion.description}
                  maxLength={5000}
                  rows={5}
                  onChange={(event) =>
                    setDraftVersion((current) => ({ ...current, description: event.target.value }))
                  }
                />
              </label>
              {draftVersion.platform === "youtube" ? (
                <div className="field-grid">
                  <label className="content-field">
                    <span>{t("composer.privacy")}</span>
                    <select
                      name="editPrivacyStatus"
                      value={draftVersion.privacyStatus}
                      onChange={(event) =>
                        setDraftVersion((current) => ({
                          ...current,
                          privacyStatus: event.target.value as PrivacyStatus,
                        }))
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
                      name="editAudience"
                      value={String(draftVersion.madeForKids)}
                      onChange={(event) =>
                        setDraftVersion((current) => ({
                          ...current,
                          madeForKids: event.target.value === "true",
                        }))
                      }
                    >
                      <option value="false">{t("composer.notMadeForKids")}</option>
                      <option value="true">{t("composer.madeForKids")}</option>
                    </select>
                  </label>
                </div>
              ) : (
                <p>
                  {draftVersion.platform === "facebook"
                    ? locale === "zh-CN"
                      ? "此修订将作为原生视频帖子发布到所选 Facebook Page。"
                      : "This revision will publish as a native video post on the selected Facebook Page."
                    : locale === "zh-CN"
                      ? "TikTok 隐私不在修订阶段预设；最终发布时重新读取 Creator Info 并手动确认 SELF_ONLY。"
                      : "TikTok privacy is not preselected in the revision; final publish reloads Creator Info and requires manual SELF_ONLY confirmation."}
                </p>
              )}
              <Button
                disabled={busy || !internalTitle.trim() || !draftVersion.title.trim()}
                onClick={() => void saveEdit()}
              >
                {t("detail.saveRevision")}
              </Button>
            </form>
          ) : null}
        </>
      ) : null}

      {result === "saved" ? (
        <StatusMessage tone="success">{t("detail.actionSaved")}</StatusMessage>
      ) : null}
      {result === "failed" ? (
        <StatusMessage tone="danger">{t("detail.actionFailed")}</StatusMessage>
      ) : null}
    </section>
  );
}
