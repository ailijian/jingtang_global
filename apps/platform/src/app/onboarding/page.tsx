import { listUserWorkspaces } from "@jingtang/db";
import { translate } from "@jingtang/i18n";
import { redirect } from "next/navigation";

import { OnboardingForm } from "../../components/onboarding-form";
import { pageSession } from "../../server/auth";
import { pageLocale } from "../../server/locale";
import { getRuntime } from "../../server/runtime";

export default async function OnboardingPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly invite?: string | readonly string[] }>;
}) {
  const [session, locale, query] = await Promise.all([pageSession(), pageLocale(), searchParams]);
  if (!session) redirect("/login");
  if (session.currentWorkspaceId && typeof query.invite !== "string") redirect("/app");
  const workspaces = await listUserWorkspaces(getRuntime().db, session.user.id);
  return (
    <main id="main-content" className="onboarding-shell">
      <p className="eyebrow">JINGTANG WORKSPACE</p>
      <h1>{translate(locale, "workspace.onboarding.title")}</h1>
      <p className="lead">
        {translate(
          locale,
          workspaces.length ? "workspace.onboarding.existing" : "workspace.onboarding.description",
        )}
      </p>
      <OnboardingForm locale={locale} />
    </main>
  );
}
