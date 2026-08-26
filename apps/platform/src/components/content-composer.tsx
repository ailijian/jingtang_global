"use client";

import type { Locale } from "@jingtang/domain";
import { translate } from "@jingtang/i18n";
import { Button, StatusMessage } from "@jingtang/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface DraftState {
  readonly step: number;
  readonly platform: "youtube" | "facebook";
  readonly asset: {
    readonly id: string;
    readonly filename: string;
    readonly byteSize: number;
    readonly mediaType: string;
  } | null;
  readonly accountReference: string;
  readonly accountDisplayName: string;
  readonly internalTitle: string;
  readonly platformTitle: string;
  readonly description: string;
  readonly privacyStatus: "private" | "unlisted" | "public";
  readonly madeForKids: boolean;
}

const emptyDraft: DraftState = {
  step: 1,
  platform: "youtube",
  asset: null,
  accountReference: "",
  accountDisplayName: "",
  internalTitle: "",
  platformTitle: "",
  description: "",
  privacyStatus: "private",
  madeForKids: false,
};

function draftForChannels(
  channels: readonly {
    readonly platform: "youtube" | "facebook";
    readonly externalAccountId: string;
    readonly displayName: string;
  }[],
): DraftState {
  const initialChannel = channels[0];
  return {
    ...emptyDraft,
    platform: initialChannel?.platform ?? "youtube",
    accountReference: initialChannel?.externalAccountId ?? "",
    accountDisplayName: initialChannel?.displayName ?? "",
  };
}

export function ContentComposer({
  locale,
  workspaceId,
  channels,
}: {
  readonly locale: Locale;
  readonly workspaceId: string;
  readonly channels: readonly {
    readonly id: string;
    readonly platform: "youtube" | "facebook";
    readonly externalAccountId: string;
    readonly displayName: string;
  }[];
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const storageKey = `jingtang:d4-content-composer:${workspaceId}`;
  const router = useRouter();
  const [draft, setDraft] = useState<DraftState>(() => draftForChannels(channels));
  const [file, setFile] = useState<File | null>(null);
  const [ownership, setOwnership] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<"ready" | "upload_failed" | "save_failed" | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = sessionStorage.getItem(storageKey);
      const initial = draftForChannels(channels);
      if (saved) {
        try {
          const restored = { ...initial, ...(JSON.parse(saved) as Partial<DraftState>) };
          const connected = channels.find(
            (channel) =>
              channel.platform === restored.platform &&
              channel.externalAccountId === restored.accountReference,
          );
          setDraft({
            ...restored,
            accountReference: connected?.externalAccountId ?? initial.accountReference,
            accountDisplayName: connected?.displayName ?? initial.accountDisplayName,
            privacyStatus: restored.platform === "facebook" ? "public" : "private",
            madeForKids: restored.platform === "youtube" ? restored.madeForKids : false,
          });
        } catch {
          sessionStorage.removeItem(storageKey);
        }
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [channels, storageKey]);

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
      const digest = new Uint8Array(
        await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
      );
      const sha256 = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      const sha256Base64 = btoa(String.fromCharCode(...digest));
      const response = await fetch("/api/v1/content/assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          mediaType: file.type,
          byteSize: file.size,
          sha256,
          sha256Base64,
          ownershipConfirmed: true,
        }),
      });
      if (!response.ok) {
        setMessage("upload_failed");
        return;
      }
      const authorization = (await response.json()) as {
        asset_id: string;
        upload: { url: string; headers: Record<string, string> };
      };
      const upload = await fetch(authorization.upload.url, {
        method: "PUT",
        headers: authorization.upload.headers,
        body: file,
      });
      if (!upload.ok) {
        setMessage("upload_failed");
        return;
      }
      const confirmation = await fetch(
        `/api/v1/content/assets/${authorization.asset_id}/complete`,
        { method: "POST" },
      );
      if (!confirmation.ok) {
        setMessage("upload_failed");
        return;
      }
      const payload = (await confirmation.json()) as {
        asset_id: string;
        filename: string;
        byte_size: number;
        media_type: string;
      };
      setDraft((current) => ({
        ...current,
        asset: {
          id: payload.asset_id,
          filename: payload.filename,
          byteSize: payload.byte_size,
          mediaType: payload.media_type,
        },
        step: 2,
      }));
      setMessage("ready");
    } catch {
      setMessage("upload_failed");
    } finally {
      setBusy(false);
    }
  }

  const platformsReady = Boolean(
    draft.accountReference.trim() &&
    draft.accountDisplayName.trim() &&
    (draft.platform !== "facebook" || draft.asset?.mediaType === "video/mp4"),
  );
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
              platform: draft.platform,
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
                  accept="video/mp4,video/quicktime"
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
              <div className="field-grid">
                {(["youtube", "facebook"] as const).map((platform) => (
                  <label
                    className={`platform-choice ${draft.platform === platform ? "platform-choice--active" : ""}`}
                    key={platform}
                  >
                    <input
                      type="radio"
                      name="platform"
                      value={platform}
                      checked={draft.platform === platform}
                      onChange={() => {
                        const first = channels.find((channel) => channel.platform === platform);
                        setDraft((current) => ({
                          ...current,
                          platform,
                          accountReference: first?.externalAccountId ?? "",
                          accountDisplayName: first?.displayName ?? "",
                          privacyStatus: platform === "facebook" ? "public" : "private",
                          madeForKids: platform === "youtube" ? current.madeForKids : false,
                        }));
                      }}
                    />
                    <strong>{platform === "youtube" ? "YouTube" : "Facebook Page"}</strong>
                    <p>
                      {platform === "youtube"
                        ? t("composer.platform.youtube.help")
                        : locale === "zh-CN"
                          ? "为已连接 Page 准备原生 MP4 视频；审批后仍需单独确认才会立即发布。"
                          : "Prepare a native MP4 video for the connected Page; approval is followed by a separate Publish Now confirmation."}
                    </p>
                  </label>
                ))}
              </div>
              <label className="content-field">
                <span>{t("composer.platform.connectedChannel")}</span>
                <select
                  name="connectedChannel"
                  value={draft.accountReference}
                  disabled={!channels.some((channel) => channel.platform === draft.platform)}
                  onChange={(event) => {
                    const channel = channels.find(
                      (candidate) =>
                        candidate.platform === draft.platform &&
                        candidate.externalAccountId === event.target.value,
                    );
                    update("accountReference", channel?.externalAccountId ?? "");
                    update("accountDisplayName", channel?.displayName ?? "");
                  }}
                >
                  {!channels.some((channel) => channel.platform === draft.platform) ? (
                    <option value="">
                      {draft.platform === "youtube"
                        ? t("composer.platform.noConnectedChannel")
                        : locale === "zh-CN"
                          ? "请先连接 Facebook Page"
                          : "Connect a Facebook Page before continuing"}
                    </option>
                  ) : null}
                  {channels
                    .filter((channel) => channel.platform === draft.platform)
                    .map((channel) => (
                      <option key={channel.id} value={channel.externalAccountId}>
                        {channel.displayName} · {channel.externalAccountId}
                      </option>
                    ))}
                </select>
              </label>
              <div className="platform-coming-soon">
                <span>Instagram · {t("composer.platform.comingSoon")}</span>
                <small>{t("composer.platform.noAction")}</small>
              </div>
              {draft.platform === "facebook" && draft.asset?.mediaType !== "video/mp4" ? (
                <StatusMessage tone="danger">
                  {locale === "zh-CN"
                    ? "Facebook Page 发布只接受 MP4；请返回并上传 MP4 源素材。"
                    : "Facebook Page publishing accepts MP4 only. Go back and upload an MP4 Source Asset."}
                </StatusMessage>
              ) : null}
            </section>
          ) : null}

          {draft.step === 3 ? (
            <section className="composer-section">
              <h2>
                {draft.platform === "youtube"
                  ? t("composer.customize.title")
                  : locale === "zh-CN"
                    ? "定制 Facebook Page 版本"
                    : "Customize Facebook Page version"}
              </h2>
              <label className="content-field">
                <span>{t("composer.internalTitle")}</span>
                <input
                  name="internalTitle"
                  value={draft.internalTitle}
                  maxLength={160}
                  onChange={(event) => update("internalTitle", event.target.value)}
                />
                <small>{t("composer.internalTitle.help")}</small>
              </label>
              <label className="content-field">
                <span>
                  {draft.platform === "youtube"
                    ? t("composer.youtubeTitle")
                    : locale === "zh-CN"
                      ? "Facebook 视频标题"
                      : "Facebook video title"}
                </span>
                <input
                  name="platformTitle"
                  value={draft.platformTitle}
                  maxLength={100}
                  onChange={(event) => update("platformTitle", event.target.value)}
                />
                <small>
                  {draft.platform === "youtube"
                    ? t("composer.youtubeTitle.help")
                    : locale === "zh-CN"
                      ? "作为原生 Page 视频的标题发送给 Facebook。"
                      : "Sent to Facebook as the native Page video's title."}
                </small>
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
                  <select name="privacyStatus" value={draft.privacyStatus} disabled>
                    <option value={draft.platform === "facebook" ? "public" : "private"}>
                      {t(
                        draft.platform === "facebook"
                          ? "composer.privacy.public"
                          : "composer.privacy.private",
                      )}
                    </option>
                  </select>
                  <small>
                    {draft.platform === "facebook"
                      ? locale === "zh-CN"
                        ? "视频将作为所选公司 Page 的原生帖子发布。"
                        : "The video is published as a native post on the selected company Page."
                      : t("composer.privacy.testOnly")}
                  </small>
                </label>
                {draft.platform === "youtube" ? (
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
                ) : null}
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
                  <dd>
                    {draft.accountDisplayName} · {draft.accountReference}
                  </dd>
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
            <strong>
              {draft.platformTitle ||
                (draft.platform === "youtube"
                  ? t("composer.youtubeTitle")
                  : locale === "zh-CN"
                    ? "Facebook 视频标题"
                    : "Facebook video title")}
            </strong>
            <small>
              {draft.accountDisplayName ||
                (draft.platform === "youtube" ? t("composer.platform.youtube") : "Facebook Page")}
            </small>
            <p>{draft.description || t("composer.preview.noDescription")}</p>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
