import { AuthForm } from "../../../components/auth-form";
import { translate } from "@jingtang/i18n";
import { pageLocale } from "../../../server/locale";
import { getRuntime } from "../../../server/runtime";

export default async function SignupPage() {
  const locale = await pageLocale();
  const config = getRuntime().config;
  return (
    <>
      <p className="eyebrow">JINGTANG WORKSPACE</p>
      <h1>{translate(locale, "auth.signUp.title")}</h1>
      <p className="lead">{translate(locale, "auth.signUp.description")}</p>
      <AuthForm
        mode="signup"
        locale={locale}
        policyLinks={{ terms: config.TERMS_URL, privacy: config.PRIVACY_URL }}
      />
    </>
  );
}
