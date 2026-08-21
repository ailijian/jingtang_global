import { getMembershipRole, listUserWorkspaces } from "@jingtang/db";
import { hasPermission } from "@jingtang/domain";
import { translate } from "@jingtang/i18n";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SignOutButton } from "../../components/sign-out-button";
import { WorkspaceSwitcher } from "../../components/workspace-switcher";
import { pageSession } from "../../server/auth";
import { pageLocale } from "../../server/locale";
import { getRuntime } from "../../server/runtime";

const nav = [
  ["/app", "nav.home", true],
  ["/app/content", "nav.content", true],
  ["/app/approvals", "nav.approvals", true],
  ["/app/calendar", "nav.calendar", true],
  ["#channels", "nav.channels", false],
  ["/app/activity", "nav.activity", true],
  ["/app/settings/team", "nav.settings", true],
] as const;

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [session, locale] = await Promise.all([pageSession(), pageLocale()]);
  if (!session) redirect("/login");
  if (!session.currentWorkspaceId) redirect("/onboarding");
  const role = await getMembershipRole(
    getRuntime().db,
    session.currentWorkspaceId,
    session.user.id,
  );
  if (!role || !hasPermission(role, "workspace.read")) redirect("/onboarding");
  const workspaces = await listUserWorkspaces(getRuntime().db, session.user.id);
  const workspace = workspaces.find((entry) => entry.id === session.currentWorkspaceId);
  const roleLabel = {
    owner_admin: translate(locale, "member.role.ownerAdmin"),
    editor: translate(locale, "member.role.editor"),
    approver_publisher: translate(locale, "member.role.approverPublisher"),
    viewer: translate(locale, "member.role.viewer"),
  }[role];
  return (
    <div className="app-shell">
      <aside className="app-rail">
        <div>
          <p className="rail-label">{translate(locale, "workspace.current")}</p>
          <WorkspaceSwitcher
            locale={locale}
            currentWorkspaceId={session.currentWorkspaceId}
            workspaces={workspaces}
          />
        </div>
        <nav aria-label="Workspace">
          <ul>
            {nav.map(([href, key, enabled]) => (
              <li key={key}>
                {enabled ? (
                  <Link href={href}>{translate(locale, key)}</Link>
                ) : (
                  <span aria-disabled="true" title={translate(locale, "stage.later.description")}>
                    {translate(locale, key)}
                    <small>{translate(locale, "stage.later")}</small>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <div className="rail-account">
          <strong>{session.user.name}</strong>
          <span>{session.user.email}</span>
          <span className="role-badge">{roleLabel}</span>
          <SignOutButton label={translate(locale, "action.signOut")} />
        </div>
      </aside>
      <div className="app-content">
        <div className="mobile-context">
          {workspace ? (
            <WorkspaceSwitcher
              compact
              locale={locale}
              currentWorkspaceId={workspace.id}
              workspaces={workspaces}
            />
          ) : null}
          <span>{roleLabel}</span>
        </div>
        <main id="main-content">{children}</main>
      </div>
    </div>
  );
}
