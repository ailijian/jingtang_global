"use client";

import type { Locale, Role } from "@jingtang/domain";
import { translate } from "@jingtang/i18n";
import { useState } from "react";

type WorkspaceOption = {
  readonly id: string;
  readonly name: string;
  readonly role: Role;
};

export function WorkspaceSwitcher({
  locale,
  currentWorkspaceId,
  workspaces,
  compact = false,
}: {
  readonly locale: Locale;
  readonly currentWorkspaceId: string;
  readonly workspaces: readonly WorkspaceOption[];
  readonly compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const label = translate(locale, "workspace.select.label");

  async function selectWorkspace(workspaceId: string) {
    if (workspaceId === currentWorkspaceId) return;
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/v1/workspaces/select", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (!response.ok) throw new Error("workspace_selection_failed");
      window.location.reload();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={compact ? "workspace-switcher workspace-switcher-compact" : "workspace-switcher"}
    >
      <label
        className={compact ? "sr-only" : undefined}
        htmlFor={compact ? "workspace-mobile" : "workspace-desktop"}
      >
        {label}
      </label>
      <select
        id={compact ? "workspace-mobile" : "workspace-desktop"}
        aria-label={label}
        value={currentWorkspaceId}
        disabled={busy}
        onChange={(event) => void selectWorkspace(event.target.value)}
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
      {failed ? (
        <span className="workspace-switcher-error" role="status">
          {translate(locale, "workspace.select.failed")}
        </span>
      ) : null}
    </div>
  );
}
