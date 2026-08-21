import { getContentDetail } from "@jingtang/db";
import { hasPermission } from "@jingtang/domain";
import { formatDateTime, formatNumber, translate } from "@jingtang/i18n";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ContentActions } from "../../../../components/content-actions";
import { contentStatusMessage } from "../../../../server/content-labels";
import { workspacePageContext } from "../../../../server/page-context";
import { getRuntime } from "../../../../server/runtime";

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
  const statusLabel = translate(locale, contentStatusMessage[content.status]);
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
                  {entry.accountDisplayName} · {entry.accountReference}
                </small>
              </div>
              <dl>
                <div>
                  <dt>{translate(locale, "composer.privacy")}</dt>
                  <dd>{translate(locale, `composer.privacy.${entry.privacyStatus}`)}</dd>
                </div>
                <div>
                  <dt>{translate(locale, "composer.audience")}</dt>
                  <dd>
                    {translate(
                      locale,
                      entry.madeForKids ? "composer.madeForKids" : "composer.notMadeForKids",
                    )}
                  </dd>
                </div>
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
          />
        </section>

        <section className="detail-card" id="publishing">
          <p className="detail-kicker">{translate(locale, "detail.publishing")}</p>
          <p>
            {content.publishing.intentCount === 0 && content.publishing.executionCount === 0
              ? translate(locale, "detail.noPublishing")
              : `${content.publishing.intentCount} / ${content.publishing.executionCount}`}
          </p>
          {content.status === "approved" ? (
            <p>{translate(locale, "detail.approvalNoPublish")}</p>
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
                    {entry.result}
                  </span>
                  <strong>{entry.action}</strong>
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
