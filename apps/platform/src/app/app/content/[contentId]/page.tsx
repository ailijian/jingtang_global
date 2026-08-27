import {
  getContentDetail,
  listFacebookChannels,
  listTikTokChannels,
  listYouTubeChannels,
} from "@jingtang/db";
import { hasPermission, type Locale } from "@jingtang/domain";
import { formatDateTime, formatNumber, translate } from "@jingtang/i18n";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ContentActions } from "../../../../components/content-actions";
import { PublishActions } from "../../../../components/publish-actions";
import { contentStatusMessage } from "../../../../server/content-labels";
import { workspacePageContext } from "../../../../server/page-context";
import { getRuntime } from "../../../../server/runtime";

function platformAccountLabel(
  locale: Locale,
  platform: "youtube" | "facebook" | "tiktok",
  accountDisplayName: string,
  accountReference: string,
): string {
  if (accountReference.startsWith("disconnected:")) {
    return platform === "facebook"
      ? locale === "zh-CN"
        ? "已断开的 Facebook Page"
        : "Disconnected Facebook Page"
      : platform === "tiktok"
        ? locale === "zh-CN"
          ? "已断开的 TikTok 账号"
          : "Disconnected TikTok account"
        : translate(locale, "detail.publish.channelDisconnected");
  }
  if (accountReference.startsWith("expired:")) {
    return platform === "facebook"
      ? locale === "zh-CN"
        ? "授权已过期的 Facebook Page"
        : "Facebook Page authorization expired"
      : platform === "tiktok"
        ? locale === "zh-CN"
          ? "授权已过期的 TikTok 账号"
          : "TikTok authorization expired"
        : translate(locale, "detail.publish.channelExpired");
  }
  return `${accountDisplayName} · ${accountReference}`;
}

export default async function ContentDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly contentId: string }>;
}) {
  const { locale, role, workspaceId } = await workspacePageContext();
  const { contentId } = await params;
  const content = await getContentDetail(getRuntime().db, workspaceId, contentId);
  if (!content) notFound();
  const version = content.revision.platformVersions[0];
  if (!version) notFound();
  const historicalChannelIdentityCleared =
    version.accountReference.startsWith("disconnected:") ||
    version.accountReference.startsWith("expired:");
  const versionChannelLabel = platformAccountLabel(
    locale,
    version.platform,
    version.accountDisplayName,
    version.accountReference,
  );
  const currentConnectedChannel = (
    await (version.platform === "facebook"
      ? listFacebookChannels(getRuntime().db, workspaceId)
      : version.platform === "tiktok"
        ? listTikTokChannels(getRuntime().db, workspaceId)
        : listYouTubeChannels(getRuntime().db, workspaceId))
  ).find((channel) => channel.state === "connected" && channel.externalAccountId);
  const versionTargetsCurrentChannel =
    currentConnectedChannel?.externalAccountId === version.accountReference;
  const statusLabel = translate(locale, contentStatusMessage[content.status]);
  const activeExecution = content.publishing.executions.some((entry) =>
    ["not_started", "publishing", "processing"].includes(entry.state),
  );
  const executionLabel =
    version.platform === "facebook"
      ? ({
          not_started: "detail.execution.notStarted",
          publishing: "detail.execution.facebook.publishing",
          processing: "detail.execution.facebook.processing",
          published: "detail.execution.facebook.published",
          failed: "detail.execution.facebook.failed",
          needs_attention: "detail.execution.needsAttention",
          cancelled: "detail.execution.cancelled",
        } as const)
      : ({
          not_started: "detail.execution.notStarted",
          publishing: "detail.execution.publishing",
          processing: "detail.execution.processing",
          published: "detail.execution.published",
          failed: "detail.execution.failed",
          needs_attention: "detail.execution.needsAttention",
          cancelled: "detail.execution.cancelled",
        } as const);
  return (
    <>
      <header className="page-heading detail-heading">
        <p className="eyebrow">{translate(locale, "detail.eyebrow")}</p>
        <span className={`content-status content-status--${content.status}`}>{statusLabel}</span>
        <h1>{content.internalTitle}</h1>
        <p>
          {translate(locale, "detail.revision")} {content.revision.number} ·{" "}
          {translate(locale, "content.owner")}: {content.createdByName}
        </p>
      </header>
      <nav className="detail-tabs" aria-label={translate(locale, "detail.eyebrow")}>
        <a href="#overview">{translate(locale, "detail.overview")}</a>
        <a href="#versions">{translate(locale, "detail.versions")}</a>
        <a href="#approval">{translate(locale, "detail.approval")}</a>
        <a href="#publishing">{translate(locale, "detail.publishing")}</a>
        <a href="#activity">{translate(locale, "detail.activity")}</a>
      </nav>
      <div className="detail-stack">
        <section className="detail-card" id="overview">
          <p className="detail-kicker">{translate(locale, "detail.overview")}</p>
          <div className="detail-grid">
            <div>
              <span>{translate(locale, "detail.asset")}</span>
              <strong>{content.sourceAsset.filename}</strong>
              <small>
                {content.sourceAsset.mediaType} ·{" "}
                {formatNumber(locale, content.sourceAsset.byteSize)} bytes
              </small>
            </div>
            <div>
              <span>{translate(locale, "detail.revision")}</span>
              <strong>{content.revision.number}</strong>
              <small>
                {content.revision.submittedAt
                  ? `${translate(locale, "detail.submitted")} · ${formatDateTime(locale, content.revision.submittedAt, "Asia/Shanghai")}`
                  : translate(locale, "detail.notSubmitted")}
              </small>
            </div>
          </div>
        </section>

        <section className="detail-card" id="versions">
          <p className="detail-kicker">{translate(locale, "detail.versions")}</p>
          {content.revision.platformVersions.map((entry) => (
            <article className="version-card" key={entry.id}>
              <div>
                <span>{entry.platform.toUpperCase()}</span>
                <strong>{entry.title}</strong>
                <small>
                  {translate(locale, "detail.publish.channel")}:{" "}
                  {platformAccountLabel(
                    locale,
                    entry.platform,
                    entry.accountDisplayName,
                    entry.accountReference,
                  )}
                </small>
              </div>
              <dl>
                <div>
                  <dt>{translate(locale, "composer.privacy")}</dt>
                  <dd>{translate(locale, `composer.privacy.${entry.privacyStatus}`)}</dd>
                </div>
                {entry.platform === "youtube" ? (
                  <div>
                    <dt>{translate(locale, "composer.audience")}</dt>
                    <dd>
                      {translate(
                        locale,
                        entry.madeForKids ? "composer.madeForKids" : "composer.notMadeForKids",
                      )}
                    </dd>
                  </div>
                ) : null}
              </dl>
              <p>{entry.description || translate(locale, "composer.preview.noDescription")}</p>
            </article>
          ))}
        </section>

        <section className="detail-card" id="approval">
          <p className="detail-kicker">{translate(locale, "detail.approval")}</p>
          {content.approval ? (
            <div className="decision-summary">
              <strong>{translate(locale, contentStatusMessage[content.approval.result])}</strong>
              <span>
                {translate(locale, "detail.decisionBy")}: {content.approval.actorName} ·{" "}
                {formatDateTime(locale, content.approval.decidedAt, "Asia/Shanghai")}
              </span>
              {content.approval.reason ? <p>{content.approval.reason}</p> : null}
            </div>
          ) : (
            <p>{translate(locale, "detail.noDecision")}</p>
          )}
          <ContentActions
            locale={locale}
            contentId={content.id}
            revisionId={content.revision.id}
            status={content.status}
            internalTitle={content.internalTitle}
            version={version}
            canEdit={hasPermission(role, "content.edit")}
            canSubmit={hasPermission(role, "content.submit")}
            canApprove={hasPermission(role, "content.approve")}
            canReject={hasPermission(role, "content.reject")}
            requiresChannelReselection={historicalChannelIdentityCleared}
            {...(currentConnectedChannel?.externalAccountId && currentConnectedChannel.displayName
              ? {
                  currentChannel: {
                    accountReference: currentConnectedChannel.externalAccountId,
                    accountDisplayName: currentConnectedChannel.displayName,
                  },
                }
              : {})}
          />
        </section>

        <section className="detail-card" id="publishing">
          <p className="detail-kicker">{translate(locale, "detail.publishing")}</p>
          <p>
            {content.publishing.intentCount === 0 && content.publishing.executionCount === 0
              ? translate(locale, "detail.noPublishing")
              : `${content.publishing.intentCount} / ${content.publishing.executionCount}`}
          </p>
          {historicalChannelIdentityCleared || content.publishing.executionCount > 0 ? (
            <>
              <dl className="review-list publishing-channel-context">
                <div>
                  <dt>{translate(locale, "detail.publish.currentChannel")}</dt>
                  <dd>
                    {currentConnectedChannel?.displayName
                      ? `${currentConnectedChannel.displayName} · ${translate(
                          locale,
                          "channel.status.connected",
                        )}`
                      : version.platform === "facebook"
                        ? locale === "zh-CN"
                          ? "没有已连接的 Facebook Page"
                          : "No connected Facebook Page"
                        : version.platform === "tiktok"
                          ? locale === "zh-CN"
                            ? "没有已连接的 TikTok 账号"
                            : "No connected TikTok account"
                          : translate(locale, "detail.publish.currentChannelNone")}
                  </dd>
                </div>
              </dl>
              <p>{translate(locale, "detail.publish.currentChannelHistoryNote")}</p>
            </>
          ) : null}
          {content.publishing.executions.map((execution) => (
            <article className="publishing-execution" key={execution.id}>
              <strong>{translate(locale, executionLabel[execution.state])}</strong>
              {execution.providerUrl ? (
                <a href={execution.providerUrl} target="_blank" rel="noreferrer">
                  {translate(
                    locale,
                    version.platform === "facebook"
                      ? "detail.publish.facebook.openVideo"
                      : "detail.publish.openVideo",
                  )}
                </a>
              ) : execution.state === "published" && historicalChannelIdentityCleared ? (
                <small>
                  {version.platform === "facebook"
                    ? locale === "zh-CN"
                      ? "Facebook 授权数据已删除，因此不再保存外部帖子链接。"
                      : "The external post link is no longer stored after Facebook Authorized Data deletion."
                    : translate(locale, "detail.publish.providerLinkCleared")}
                </small>
              ) : null}
              {execution.state === "needs_attention" ? (
                <Link href="/app/channels">
                  {translate(locale, "detail.publish.reviewChannel")}
                </Link>
              ) : null}
              {execution.state === "failed" || execution.state === "needs_attention" ? (
                <Link href="/app/content">
                  {translate(locale, "detail.publish.returnToContent")}
                </Link>
              ) : null}
              {execution.failureCategory ? (
                <small>
                  {execution.failureCategory === "controlled_test_fault"
                    ? translate(locale, "detail.publish.controlledFailure")
                    : execution.failureCategory}
                </small>
              ) : null}
              <time dateTime={execution.updatedAt.toISOString()}>
                {formatDateTime(locale, execution.updatedAt, "Asia/Shanghai")}
              </time>
            </article>
          ))}
          {content.status === "approved" ? (
            <p>{translate(locale, "detail.approvalNoPublish")}</p>
          ) : null}
          {content.status === "approved" ? (
            <PublishActions
              locale={locale}
              contentId={content.id}
              revisionId={content.revision.id}
              canPublish={
                versionTargetsCurrentChannel &&
                (version.platform === "youtube"
                  ? version.privacyStatus === "private"
                  : version.platform === "facebook"
                    ? version.privacyStatus === "public" &&
                      content.sourceAsset.mediaType === "video/mp4" &&
                      content.sourceAsset.byteSize <= 500 * 1024 * 1024
                    : version.privacyStatus === "unselected" &&
                      content.sourceAsset.mediaType === "video/mp4" &&
                      content.sourceAsset.byteSize <= 500 * 1024 * 1024 &&
                      Boolean(content.sourceAsset.durationSeconds)) &&
                hasPermission(role, "content.publish")
              }
              hasExecution={content.publishing.executionCount > 0}
              polling={activeExecution}
              sourceFilename={content.sourceAsset.filename}
              title={version.title}
              description={version.description}
              channel={versionChannelLabel}
              madeForKids={version.madeForKids}
              platform={version.platform}
              channelId={currentConnectedChannel?.id ?? null}
              durationSeconds={content.sourceAsset.durationSeconds}
            />
          ) : null}
          <span className="unavailable-pill">{translate(locale, "composer.schedule")}</span>
        </section>

        <section className="detail-card" id="activity">
          <p className="detail-kicker">{translate(locale, "detail.activity")}</p>
          {content.activity.length ? (
            <div className="detail-activity-list">
              {content.activity.map((entry) => (
                <article key={entry.id}>
                  <span className={`audit-result audit-result--${entry.result}`}>
                    {translate(locale, `activity.result.${entry.result}`)}
                  </span>
                  <strong>{translate(locale, `activity.action.${entry.action}`)}</strong>
                  <span>{entry.actorName ?? translate(locale, "activity.actor.system")}</span>
                  <time dateTime={entry.occurredAt.toISOString()}>
                    {formatDateTime(locale, entry.occurredAt, "Asia/Shanghai")}
                  </time>
                </article>
              ))}
            </div>
          ) : null}
          <Link href="/app/activity">{translate(locale, "activity.title")}</Link>
        </section>
      </div>
    </>
  );
}
