import { listContents } from "@jingtang/db";
import { hasPermission } from "@jingtang/domain";
import { formatDateTime, translate } from "@jingtang/i18n";
import { PageState } from "@jingtang/ui";
import Link from "next/link";

import { contentStatusMessage } from "../../../server/content-labels";
import { workspacePageContext } from "../../../server/page-context";
import { getRuntime } from "../../../server/runtime";

export default async function ContentPage() {
  const { locale, role, workspaceId } = await workspacePageContext();
  const contents = await listContents(getRuntime().db, workspaceId);
  return (
    <>
      <header className="page-heading page-heading--action">
        <div>
          <p className="eyebrow">{translate(locale, "content.eyebrow")}</p>
          <h1>{translate(locale, "content.title")}</h1>
          <p>{translate(locale, "content.description")}</p>
        </div>
        {hasPermission(role, "content.create") ? (
          <Link className="jt-button jt-button--primary link-button" href="/app/content/new">
            {translate(locale, "content.new")}
          </Link>
        ) : null}
      </header>
      {contents.length ? (
        <div className="content-list">
          {contents.map((content) => (
            <article className="content-row" key={content.id}>
              <div>
                <span className={`content-status content-status--${content.status}`}>
                  {translate(locale, contentStatusMessage[content.status])}
                </span>
                <h2>{content.internalTitle}</h2>
                <p>
                  {translate(locale, "content.owner")}: {content.createdByName} ·{" "}
                  {translate(locale, "content.platforms")}: {content.platformCount}
                </p>
              </div>
              <div className="content-row__meta">
                <span>
                  {translate(locale, "content.updated")} ·{" "}
                  {formatDateTime(locale, content.updatedAt, "Asia/Shanghai")}
                </span>
                <Link href={`/app/content/${content.id}`}>{translate(locale, "content.open")}</Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <PageState
          title={translate(locale, "content.empty.title")}
          description={translate(locale, "content.empty.description")}
        />
      )}
    </>
  );
}
