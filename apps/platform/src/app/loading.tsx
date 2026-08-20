import { PageState } from "@jingtang/ui";
import { translate } from "@jingtang/i18n";

export default function Loading() {
  return (
    <main id="main-content" className="state-shell" aria-live="polite">
      <PageState
        title={`${translate("en", "state.loading")} / ${translate("zh-CN", "state.loading")}`}
        description={translate("en", "state.loading.description")}
      />
    </main>
  );
}
