import { AuthForm } from "../../../components/auth-form";
import { translate } from "@jingtang/i18n";
import { pageLocale } from "../../../server/locale";

export default async function LoginPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    readonly account_deletion?: string | readonly string[];
    readonly reference?: string | readonly string[];
  }>;
}) {
  const [locale, query] = await Promise.all([pageLocale(), searchParams]);
  return (
    <>
      <p className="eyebrow">JINGTANG WORKSPACE</p>
      <h1>{translate(locale, "auth.login.title")}</h1>
      <p className="lead">{translate(locale, "auth.login.description")}</p>
      {query.account_deletion === "pending" ? (
        <p className="channel-notice channel-notice--success" role="status">
          {translate(locale, "dataSettings.account.pending").replace(
            "{reference}",
            typeof query.reference === "string" ? query.reference : "",
          )}
        </p>
      ) : null}
      <AuthForm mode="login" locale={locale} />
    </>
  );
}
