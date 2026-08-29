"use client";

import type { Locale, Platform } from "@jingtang/domain";
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
  canRetry,
  polling,
  sourceFilename,
  title,
  description,
  channel,
  madeForKids,
  platform,
  channelId,
  durationSeconds,
}: {
  readonly locale: Locale;
  readonly contentId: string;
  readonly revisionId: string;
  readonly canPublish: boolean;
  readonly hasExecution: boolean;
  readonly canRetry: boolean;
  readonly polling: boolean;
  readonly sourceFilename: string;
  readonly title: string;
  readonly description: string;
  readonly channel: string;
  readonly madeForKids: boolean;
  readonly platform: Platform;
  readonly channelId: string | null;
  readonly durationSeconds: number | null;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [musicConfirmed, setMusicConfirmed] = useState(false);
  const [creatorInfoConfirmed, setCreatorInfoConfirmed] = useState(false);
  const [tikTokPrivacy, setTikTokPrivacy] = useState<"" | "SELF_ONLY">("");
  const [allowComments, setAllowComments] = useState(false);
  const [allowDuet, setAllowDuet] = useState(false);
  const [allowStitch, setAllowStitch] = useState(false);
  const [brandOrganic, setBrandOrganic] = useState(false);
  const [isAigc, setIsAigc] = useState(false);
  const [creatorInfo, setCreatorInfo] = useState<{
    readonly creator_username: string;
    readonly creator_nickname: string;
    readonly privacy_level_options: readonly string[];
    readonly comment_disabled: boolean;
    readonly duet_disabled: boolean;
    readonly stitch_disabled: boolean;
    readonly max_video_post_duration_sec: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<"queued" | "failed" | null>(null);
  const publishBlocked = hasExecution && !canRetry;

  useEffect(() => {
    if (!polling && (message !== "queued" || hasExecution)) return;
    const timer = window.setInterval(() => router.refresh(), 3_000);
    return () => window.clearInterval(timer);
  }, [hasExecution, message, polling, router]);

  useEffect(() => {
    if (platform !== "tiktok" || !channelId || publishBlocked) return;
    const controller = new AbortController();
    void fetch(`/api/v1/channels/tiktok/creator-info?channel_id=${encodeURIComponent(channelId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("creator_info_failed");
        setCreatorInfo((await response.json()) as NonNullable<typeof creatorInfo>);
      })
      .catch(() => {
        if (!controller.signal.aborted) setMessage("failed");
      });
    return () => controller.abort();
  }, [channelId, platform, publishBlocked]);

  async function publish() {
    if (
      !confirmed ||
      busy ||
      publishBlocked ||
      (platform === "tiktok" &&
        (!creatorInfo || tikTokPrivacy !== "SELF_ONLY" || !musicConfirmed || !creatorInfoConfirmed))
    ) {
      return;
    }
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
          ...(platform === "instagram"
            ? {
                instagram: {
                  mediaType: "REELS",
                  shareToFeed: false,
                  publishMode: "IMMEDIATE",
                },
              }
            : {}),
          ...(platform === "tiktok" && channelId
            ? {
                tiktok: {
                  channelId,
                  privacyLevel: tikTokPrivacy,
                  disableComment: !allowComments,
                  disableDuet: !allowDuet,
                  disableStitch: !allowStitch,
                  brandContentToggle: false,
                  brandOrganicToggle: brandOrganic,
                  isAigc,
                  musicUsageConfirmed: true,
                  creatorInfoConfirmed: true,
                },
              }
            : {}),
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
        {platform !== "instagram" ? (
          <p>{description || t("composer.preview.noDescription")}</p>
        ) : null}
      </aside>
      <dl className="review-list">
        <div>
          <dt>{t("detail.publish.video")}</dt>
          <dd>{sourceFilename}</dd>
        </div>
        <div>
          <dt>
            {platform === "youtube"
              ? t("composer.youtubeTitle")
              : platform === "facebook" && locale === "zh-CN"
                ? "Facebook 视频标题"
                : platform === "facebook"
                  ? "Facebook video title"
                  : platform === "instagram"
                    ? "Instagram caption"
                    : locale === "zh-CN"
                      ? "TikTok 标题/说明"
                      : "TikTok title/caption"}
          </dt>
          <dd>{title}</dd>
        </div>
        {platform !== "instagram" ? (
          <div>
            <dt>{t("composer.descriptionField")}</dt>
            <dd>{description || t("composer.preview.noDescription")}</dd>
          </div>
        ) : null}
        <div>
          <dt>
            {t(hasExecution ? "detail.publish.channel" : "composer.platform.connectedChannel")}
          </dt>
          <dd>{channel}</dd>
        </div>
        <div>
          <dt>{t("composer.privacy")}</dt>
          <dd>
            {platform === "youtube"
              ? t("composer.privacy.private")
              : platform === "facebook"
                ? t("composer.privacy.public")
                : platform === "instagram"
                  ? locale === "zh-CN"
                    ? "Reels 标签页（share_to_feed=false）"
                    : "Reels tab only (share_to_feed=false)"
                  : tikTokPrivacy || (locale === "zh-CN" ? "未选择" : "Not selected")}
          </dd>
        </div>
        {platform === "youtube" ? (
          <div>
            <dt>{t("composer.audience")}</dt>
            <dd>{t(madeForKids ? "composer.madeForKids" : "composer.notMadeForKids")}</dd>
          </div>
        ) : null}
        <div>
          <dt>{t("detail.publish.mode")}</dt>
          <dd>{t("detail.publish.mode.now")}</dd>
        </div>
        {platform === "instagram" ? (
          <div>
            <dt>{locale === "zh-CN" ? "Instagram 媒体类型" : "Instagram media type"}</dt>
            <dd>REELS · share_to_feed=false</dd>
          </div>
        ) : null}
      </dl>
      {canRetry ? (
        <StatusMessage tone="info">{t("detail.publish.retryAvailable")}</StatusMessage>
      ) : null}
      {platform === "tiktok" && !publishBlocked ? (
        <div className="publish-confirmation-options">
          {creatorInfo ? (
            <StatusMessage tone="info">
              {locale === "zh-CN"
                ? `最新 Creator Info：${creatorInfo.creator_nickname}（@${creatorInfo.creator_username}）；视频上限 ${creatorInfo.max_video_post_duration_sec} 秒，当前素材 ${durationSeconds ?? "?"} 秒。`
                : `Fresh Creator Info: ${creatorInfo.creator_nickname} (@${creatorInfo.creator_username}); maximum ${creatorInfo.max_video_post_duration_sec}s, current asset ${durationSeconds ?? "?"}s.`}
            </StatusMessage>
          ) : (
            <StatusMessage tone="info">
              {locale === "zh-CN"
                ? "正在读取最新 TikTok Creator Info…"
                : "Loading fresh TikTok Creator Info…"}
            </StatusMessage>
          )}
          <p>
            {locale === "zh-CN"
              ? "互动默认关闭；只有 TikTok 当前允许时才可手动开启。"
              : "Interactions are off by default and can be enabled only when TikTok currently permits them."}
          </p>
          <label>
            <span>
              {locale === "zh-CN"
                ? "隐私设置（必须手动选择）"
                : "Privacy (manual selection required)"}
            </span>
            <select
              value={tikTokPrivacy}
              disabled={!creatorInfo}
              onChange={(event) =>
                setTikTokPrivacy(event.target.value === "SELF_ONLY" ? "SELF_ONLY" : "")
              }
            >
              <option value="">{locale === "zh-CN" ? "请选择" : "Select privacy"}</option>
              {creatorInfo?.privacy_level_options.includes("SELF_ONLY") ? (
                <option value="SELF_ONLY">SELF_ONLY</option>
              ) : null}
            </select>
          </label>
          <label className="ownership-row">
            <input
              type="checkbox"
              checked={allowComments}
              disabled={!creatorInfo || creatorInfo.comment_disabled}
              onChange={(event) => setAllowComments(event.target.checked)}
            />
            <span>{locale === "zh-CN" ? "允许评论" : "Allow comments"}</span>
          </label>
          <label className="ownership-row">
            <input type="checkbox" checked={false} disabled readOnly />
            <span>
              {locale === "zh-CN"
                ? "付费品牌内容（SELF_ONLY 私密发布不可用）"
                : "Paid branded content (unavailable for SELF_ONLY private publishing)"}
            </span>
          </label>
          <label className="ownership-row">
            <input
              type="checkbox"
              checked={allowDuet}
              disabled={!creatorInfo || creatorInfo.duet_disabled}
              onChange={(event) => setAllowDuet(event.target.checked)}
            />
            <span>{locale === "zh-CN" ? "允许合拍" : "Allow Duet"}</span>
          </label>
          <label className="ownership-row">
            <input
              type="checkbox"
              checked={allowStitch}
              disabled={!creatorInfo || creatorInfo.stitch_disabled}
              onChange={(event) => setAllowStitch(event.target.checked)}
            />
            <span>{locale === "zh-CN" ? "允许 Stitch" : "Allow Stitch"}</span>
          </label>
          <label className="ownership-row">
            <input
              type="checkbox"
              checked={brandOrganic}
              onChange={(event) => setBrandOrganic(event.target.checked)}
            />
            <span>
              {locale === "zh-CN"
                ? "此内容推广我自己的品牌/业务（非付费品牌内容）"
                : "This content promotes my own brand/business (not paid branded content)"}
            </span>
          </label>
          <label className="ownership-row">
            <input
              type="checkbox"
              checked={isAigc}
              onChange={(event) => setIsAigc(event.target.checked)}
            />
            <span>
              {locale === "zh-CN"
                ? "此视频包含 AI 生成内容"
                : "This video contains AI-generated content"}
            </span>
          </label>
          <label className="ownership-row">
            <input
              type="checkbox"
              checked={musicConfirmed}
              onChange={(event) => setMusicConfirmed(event.target.checked)}
            />
            <span>
              {locale === "zh-CN"
                ? "我确认遵守 TikTok 音乐使用条款。"
                : "I confirm compliance with TikTok's music usage terms."}
            </span>
          </label>
          <label className="ownership-row">
            <input
              type="checkbox"
              checked={creatorInfoConfirmed}
              onChange={(event) => setCreatorInfoConfirmed(event.target.checked)}
            />
            <span>
              {locale === "zh-CN"
                ? "我已核对以上 Creator Info、披露与 SELF_ONLY 设置。"
                : "I reviewed the Creator Info, disclosures, and SELF_ONLY setting above."}
            </span>
          </label>
        </div>
      ) : null}
      {!publishBlocked ? (
        <>
          <label className="ownership-row">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={!canPublish || busy}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>
              {platform === "youtube"
                ? t("detail.publish.confirmation")
                : platform === "facebook" && locale === "zh-CN"
                  ? "我确认将此准确 MP4、标题和描述立即发布为所选公司 Facebook Page 的原生视频帖子。"
                  : platform === "facebook"
                    ? "I confirm this exact MP4, title, and description for immediate publication as a native video post on the selected company Facebook Page."
                    : platform === "instagram"
                      ? locale === "zh-CN"
                        ? "我确认将此准确 MP4 与 caption 立即发布到所选 Instagram Professional 账号，media_type=REELS、share_to_feed=false；断开不会删除 Instagram 托管的 Reel。"
                        : "I confirm this exact MP4 and caption for immediate publication to the selected Instagram Professional account with media_type=REELS and share_to_feed=false. Disconnecting does not delete the Instagram-hosted Reel."
                      : locale === "zh-CN"
                        ? "我确认将此准确 MP4 与标题通过受限的 PULL_FROM_URL 媒体传输立即发布到所选 TikTok 私密账号，隐私为 SELF_ONLY。"
                        : "I confirm this exact MP4 and title for immediate provider-only PULL_FROM_URL transfer to the selected private TikTok account as SELF_ONLY."}
            </span>
          </label>
          <Button
            disabled={
              !canPublish ||
              !confirmed ||
              busy ||
              (platform === "tiktok" &&
                (!creatorInfo ||
                  tikTokPrivacy !== "SELF_ONLY" ||
                  !musicConfirmed ||
                  !creatorInfoConfirmed))
            }
            onClick={() => void publish()}
          >
            {busy
              ? canRetry
                ? t("detail.publish.retryWorking")
                : platform === "facebook"
                  ? t("detail.publish.facebook.working")
                  : platform === "instagram"
                    ? locale === "zh-CN"
                      ? "正在创建已确认的 Reel…"
                      : "Creating the confirmed Reel…"
                    : platform === "tiktok"
                      ? t("detail.publish.tiktok.working")
                      : t("detail.publish.working")
              : canRetry
                ? t("detail.publish.retryAction")
                : platform === "facebook"
                  ? t("detail.publish.facebook.action")
                  : platform === "instagram"
                    ? locale === "zh-CN"
                      ? "立即发布 Instagram Reel"
                      : "Publish Instagram Reel now"
                    : platform === "tiktok"
                      ? t("detail.publish.tiktok.action")
                      : t("detail.publish.action")}
          </Button>
        </>
      ) : null}
      {!canPublish && !publishBlocked ? (
        <StatusMessage tone="danger">{t("detail.publish.notAllowed")}</StatusMessage>
      ) : null}
      {message === "queued" && !publishBlocked ? (
        <StatusMessage tone="success">
          {t(
            platform === "facebook"
              ? "detail.publish.facebook.queued"
              : platform === "instagram"
                ? "detail.publish.instagram.queued"
                : platform === "tiktok"
                  ? "detail.publish.tiktok.queued"
                  : "detail.publish.queued",
          )}
        </StatusMessage>
      ) : null}
      {message === "failed" ? (
        <StatusMessage tone="danger">
          {t(
            platform === "facebook"
              ? "detail.publish.facebook.failed"
              : platform === "instagram"
                ? "detail.publish.instagram.failed"
                : platform === "tiktok"
                  ? "detail.publish.tiktok.failed"
                  : "detail.publish.failed",
          )}
        </StatusMessage>
      ) : null}
    </div>
  );
}
