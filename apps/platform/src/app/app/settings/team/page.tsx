import { getMembershipRole, listMembers, listPendingInvitations } from "@jingtang/db";
import { hasPermission } from "@jingtang/domain";
import { translate } from "@jingtang/i18n";
import { redirect } from "next/navigation";

import { TeamManager } from "../../../../components/team-manager";
import { pageSession } from "../../../../server/auth";
import { pageLocale } from "../../../../server/locale";
import { getRuntime } from "../../../../server/runtime";

export default async function TeamPage() {
  const [session, locale] = await Promise.all([pageSession(), pageLocale()]);
  if (!session?.currentWorkspaceId) redirect("/login");
  const role = await getMembershipRole(
    getRuntime().db,
    session.currentWorkspaceId,
    session.user.id,
  );
  if (!role) redirect("/onboarding");
  const [members, invitations] = await Promise.all([
    listMembers(getRuntime().db, session.currentWorkspaceId),
    listPendingInvitations(getRuntime().db, session.currentWorkspaceId),
  ]);
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">SETTINGS / TEAM</p>
        <h1>{translate(locale, "member.team.title")}</h1>
        <p>{translate(locale, "member.description")}</p>
      </header>
      <TeamManager
        locale={locale}
        members={members}
        invitations={invitations.map((entry) => ({
          ...entry,
          expiresAt: entry.expiresAt.toISOString(),
        }))}
        canManage={hasPermission(role, "member.invite")}
        currentUserId={session.user.id}
      />
    </>
  );
}
