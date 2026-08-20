import { AuthForm } from "../../../components/auth-form";
import { translate } from "@jingtang/i18n";
import { pageLocale } from "../../../server/locale";

export default async function LoginPage() {
  const locale = await pageLocale();
  return (
    <>
      <p className="eyebrow">JINGTANG WORKSPACE</p>
      <h1>{translate(locale, "auth.login.title")}</h1>
      <p className="lead">{translate(locale, "auth.login.description")}</p>
      <AuthForm mode="login" locale={locale} />
    </>
  );
}
