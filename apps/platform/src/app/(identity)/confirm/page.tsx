import { AuthForm } from "../../../components/auth-form";
import { translate } from "@jingtang/i18n";
import { pageLocale } from "../../../server/locale";

export default async function ConfirmPage() {
  const locale = await pageLocale();
  return (
    <>
      <p className="eyebrow">IDENTITY</p>
      <h1>{translate(locale, "auth.confirm.title")}</h1>
      <p className="lead">{translate(locale, "auth.confirm.description")}</p>
      <AuthForm mode="confirm" locale={locale} />
    </>
  );
}
