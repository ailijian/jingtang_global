import { PageState } from "@jingtang/ui";
import { translate } from "@jingtang/i18n";

import { pageLocale } from "../../server/locale";

export default async function WorkspaceHome() {
  const locale = await pageLocale();
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">OVERVIEW</p>
        <h1>{translate(locale, "home.title")}</h1>
        <p>{translate(locale, "workspace.create.description")}</p>
      </header>
      <PageState
        title={translate(locale, "home.empty.title")}
        description={translate(locale, "home.empty.description")}
      />
    </>
  );
}
