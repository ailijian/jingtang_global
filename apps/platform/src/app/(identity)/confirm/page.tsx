import { AuthForm } from "../../../components/auth-form";
import { translate } from "@jingtang/i18n";
import { pageLocale } from "../../../server/locale";
import { getRuntime } from "../../../server/runtime";
import { redirect } from "next/navigation";

export default async function ConfirmPage() {
  if (getRuntime().config.APP_ENV === "review") redirect("/login");
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
