import { translate } from "@jingtang/i18n";
import Link from "next/link";

import { workspacePageContext } from "../../../server/page-context";

export default async function SettingsPage() {
  const { locale } = await workspacePageContext();
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">SETTINGS</p>
        <h1>{translate(locale, "settings.title")}</h1>
        <p>{translate(locale, "settings.description")}</p>
      </header>
      <div className="settings-grid">
        <Link className="settings-card" href="/app/settings/team">
          <h2>{translate(locale, "settings.team.title")}</h2>
          <p>{translate(locale, "settings.team.description")}</p>
        </Link>
        <Link className="settings-card" href="/app/settings/data">
          <h2>{translate(locale, "settings.data.title")}</h2>
          <p>{translate(locale, "settings.data.description")}</p>
        </Link>
      </div>
    </>
  );
}
