import { getMembershipRole } from "@jingtang/db";
import { redirect } from "next/navigation";

import { pageSession } from "./auth";
import { pageLocale } from "./locale";
import { getRuntime } from "./runtime";

export async function workspacePageContext() {
  const [session, locale] = await Promise.all([pageSession(), pageLocale()]);
  if (!session) redirect("/login");
  if (!session.currentWorkspaceId) redirect("/onboarding");
  const role = await getMembershipRole(
    getRuntime().db,
    session.currentWorkspaceId,
    session.user.id,
  );
  if (!role) redirect("/onboarding");
  return { session, locale, role, workspaceId: session.currentWorkspaceId };
}
