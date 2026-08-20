"use client";

import { Button, PageState } from "@jingtang/ui";
import { translate } from "@jingtang/i18n";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" className="state-shell">
      <PageState
        title={`${translate("en", "state.error")} / ${translate("zh-CN", "state.error")}`}
        description={translate("en", "state.error.description")}
        action={
          <Button onClick={reset}>
            {translate("en", "state.retry")} / {translate("zh-CN", "state.retry")}
          </Button>
        }
      />
    </main>
  );
}
