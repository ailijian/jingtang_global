import { AuthForm } from "../../../components/auth-form";
import { translate } from "@jingtang/i18n";
import { pageLocale } from "../../../server/locale";
import { getRuntime } from "../../../server/runtime";
import { redirect } from "next/navigation";

export default async function SignupPage() {
  const locale = await pageLocale();
  const config = getRuntime().config;
  if (config.APP_ENV === "review") redirect("/login");
  const localizePolicyUrl = (url: string) =>
    locale === "zh-CN" ? url.replace("/en/", "/zh-cn/") : url;
  return (
    <>
      <p className="eyebrow">JINGTANG WORKSPACE</p>
      <h1>{translate(locale, "auth.signUp.title")}</h1>
      <p className="lead">{translate(locale, "auth.signUp.description")}</p>
      <AuthForm
        mode="signup"
        locale={locale}
        policyLinks={{
          terms: localizePolicyUrl(config.TERMS_URL),
          privacy: localizePolicyUrl(config.PRIVACY_URL),
        }}
      />
    </>
  );
}
