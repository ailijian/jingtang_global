import { translate } from "@jingtang/i18n";
import { PageState } from "@jingtang/ui";

import { workspacePageContext } from "../../../server/page-context";

export default async function CalendarPage() {
  const { locale } = await workspacePageContext();
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">{translate(locale, "calendar.eyebrow")}</p>
        <h1>{translate(locale, "calendar.title")}</h1>
        <p>{translate(locale, "calendar.description")}</p>
      </header>
      <PageState
        title={translate(locale, "calendar.empty.title")}
        description={translate(locale, "calendar.empty.description")}
      />
    </>
  );
}
