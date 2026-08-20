import { AuthForm } from "../../../components/auth-form";
import { translate } from "@jingtang/i18n";
import { pageLocale } from "../../../server/locale";

export default async function ResetPage() {
  const locale = await pageLocale();
  return (
    <>
      <p className="eyebrow">IDENTITY</p>
      <h1>{translate(locale, "auth.reset.title")}</h1>
      <p className="lead">{translate(locale, "auth.reset.description")}</p>
      <AuthForm mode="reset" locale={locale} />
    </>
  );
}
