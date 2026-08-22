import { listUserWorkspaces } from "@jingtang/db";
import { hasPermission } from "@jingtang/domain";
import { translate } from "@jingtang/i18n";

import { DestructiveActionDialog } from "../../../../components/destructive-action-dialog";
import { workspacePageContext } from "../../../../server/page-context";
import { getRuntime } from "../../../../server/runtime";

export default async function DataSettingsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    readonly deletion?: string | readonly string[];
    readonly reference?: string | readonly string[];
  }>;
}) {
  const [{ locale, role, session, workspaceId }, query] = await Promise.all([
    workspacePageContext(),
    searchParams,
  ]);
  const workspaces = await listUserWorkspaces(getRuntime().db, session.user.id);
  const workspace = workspaces.find((entry) => entry.id === workspaceId);
  if (!workspace) return null;
  const result = typeof query.deletion === "string" ? query.deletion : undefined;
  const reference = typeof query.reference === "string" ? query.reference : undefined;
  const canDelete = hasPermission(role, "data.delete");
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">SETTINGS / DATA &amp; ACCOUNT</p>
        <h1>{translate(locale, "dataSettings.title")}</h1>
        <p>{translate(locale, "dataSettings.description")}</p>
      </header>
      {result === "completed" ? (
        <p className="channel-notice channel-notice--success" role="status">
          {translate(locale, "dataSettings.result.completed").replace(
            "{reference}",
            reference ?? "",
          )}
        </p>
      ) : null}
      {result === "failed" ? (
        <p className="channel-notice channel-notice--error" role="alert">
          {translate(locale, "dataSettings.result.failed").replace("{reference}", reference ?? "")}
        </p>
      ) : null}
      <section className="data-boundary-card">
        <h2>{translate(locale, "dataSettings.workspace.title")}</h2>
        <p>{translate(locale, "dataSettings.workspace.body")}</p>
        <ul>
          <li>{translate(locale, "dataSettings.workspace.effectAccess")}</li>
          <li>{translate(locale, "dataSettings.workspace.effectRevoke")}</li>
          <li>{translate(locale, "dataSettings.workspace.effectThirdParty")}</li>
          <li>{translate(locale, "dataSettings.workspace.effectBackup")}</li>
        </ul>
        {canDelete ? (
          <DestructiveActionDialog
            action="/api/v1/data-deletion"
            triggerLabel={translate(locale, "dataSettings.workspace.action")}
            title={translate(locale, "dataSettings.workspace.confirmTitle")}
            description={translate(locale, "dataSettings.workspace.confirmBody").replace(
              "{workspace}",
              workspace.name,
            )}
            consequences={[
              translate(locale, "dataSettings.workspace.effectAccess"),
              translate(locale, "dataSettings.workspace.effectRevoke"),
              translate(locale, "dataSettings.workspace.effectThirdParty"),
            ]}
            submitLabel={translate(locale, "dataSettings.workspace.action")}
            pendingLabel={translate(locale, "dataSettings.workspace.deleting")}
            cancelLabel={translate(locale, "action.cancel")}
            hiddenFields={{ confirmation: "delete_jingtang_data" }}
            confirmation={{
              label: translate(locale, "dataSettings.workspace.typeName").replace(
                "{workspace}",
                workspace.name,
              ),
              name: "workspace_name",
              expectedValue: workspace.name,
            }}
          />
        ) : (
          <p>{translate(locale, "permission.denied")}</p>
        )}
      </section>
    </>
  );
}
