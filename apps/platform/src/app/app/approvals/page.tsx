import { listContents } from "@jingtang/db";
import { translate } from "@jingtang/i18n";
import { PageState } from "@jingtang/ui";
import Link from "next/link";

import { workspacePageContext } from "../../../server/page-context";
import { getRuntime } from "../../../server/runtime";

export default async function ApprovalsPage() {
  const { locale, workspaceId } = await workspacePageContext();
  const contents = await listContents(getRuntime().db, workspaceId, "pending_approval");
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">{translate(locale, "approval.eyebrow")}</p>
        <h1>{translate(locale, "approval.title")}</h1>
        <p>{translate(locale, "approval.description")}</p>
      </header>
      {contents.length ? (
        <div className="content-list">
          {contents.map((content) => (
            <article className="content-row" key={content.id}>
              <div>
                <span className="content-status content-status--pending_approval">
                  {translate(locale, "content.status.pending_approval")}
                </span>
                <h2>{content.internalTitle}</h2>
                <p>
                  {translate(locale, "detail.revision")} {content.currentRevisionNumber} ·{" "}
                  {content.platformCount} {translate(locale, "content.platforms")}
                </p>
              </div>
              <Link href={`/app/content/${content.id}`}>{translate(locale, "content.open")}</Link>
            </article>
          ))}
        </div>
      ) : (
        <PageState
          title={translate(locale, "approval.empty.title")}
          description={translate(locale, "approval.empty.description")}
        />
      )}
    </>
  );
}
