import { AuthForm } from "../../../components/auth-form";
import { translate } from "@jingtang/i18n";
import { pageLocale } from "../../../server/locale";
import { getRuntime } from "../../../server/runtime";
import { redirect } from "next/navigation";

export default async function ResetPage() {
  if (getRuntime().config.APP_ENV === "review") redirect("/login");
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
