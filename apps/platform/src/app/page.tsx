import { redirect } from "next/navigation";

import { pageSession } from "../server/auth";

export default async function RootPage() {
  const session = await pageSession();
  redirect(session ? (session.currentWorkspaceId ? "/app" : "/onboarding") : "/login");
}
