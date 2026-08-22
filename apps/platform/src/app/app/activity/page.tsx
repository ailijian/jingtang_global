import { listActivity } from "@jingtang/db";
import { formatDateTime, translate } from "@jingtang/i18n";
import { PageState } from "@jingtang/ui";

import { workspacePageContext } from "../../../server/page-context";
import { getRuntime } from "../../../server/runtime";

export default async function ActivityPage() {
  const { locale, workspaceId } = await workspacePageContext();
  const activity = await listActivity(getRuntime().db, workspaceId);
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">{translate(locale, "activity.eyebrow")}</p>
        <h1>{translate(locale, "activity.title")}</h1>
        <p>{translate(locale, "activity.description")}</p>
      </header>
      {activity.length ? (
        <div className="activity-list">
          {activity.map((entry) => (
            <article key={entry.id}>
              <span className={`audit-result audit-result--${entry.result}`}>
                {translate(locale, `activity.result.${entry.result}`)}
              </span>
              <div>
                <strong>{translate(locale, `activity.action.${entry.action}`)}</strong>
                <p>
                  {entry.targetType} · {entry.targetId}
                </p>
              </div>
              <div>
                <span>{entry.actorName ?? translate(locale, "activity.actor.system")}</span>
                <time dateTime={entry.occurredAt.toISOString()}>
                  {formatDateTime(locale, entry.occurredAt, "Asia/Shanghai")}
                </time>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <PageState
          title={translate(locale, "activity.empty.title")}
          description={translate(locale, "activity.empty.description")}
        />
      )}
    </>
  );
}
