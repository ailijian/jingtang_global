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
  readonly searchParams: Promise<{
    readonly invite?: string | readonly string[];
    readonly deletion?: string | readonly string[];
    readonly reference?: string | readonly string[];
  }>;
}) {
  const [session, locale, query] = await Promise.all([pageSession(), pageLocale(), searchParams]);
  if (!session) redirect("/login");
  const deletionCompleted = query.deletion === "completed";
  const deletionReference = typeof query.reference === "string" ? query.reference : undefined;
  if (session.currentWorkspaceId && typeof query.invite !== "string" && !deletionCompleted) {
    redirect("/app");
  }
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
      {deletionCompleted ? (
        <p className="channel-notice channel-notice--success" role="status">
          {translate(locale, "dataSettings.result.completed").replace(
            "{reference}",
            deletionReference ?? "",
          )}
        </p>
      ) : null}
      <OnboardingForm locale={locale} />
    </main>
  );
}
