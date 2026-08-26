"use client";

import { type ReactNode, useState } from "react";

export function ChannelConnectionForm({
  canConnect,
  buttonLabel,
  pendingLabel,
  unavailableMessage,
  children,
  action = "/api/v1/channels/youtube/oauth",
}: {
  readonly canConnect: boolean;
  readonly buttonLabel: string;
  readonly pendingLabel: string;
  readonly unavailableMessage: string | undefined;
  readonly children: ReactNode;
  readonly action?: string;
}) {
  const [pending, setPending] = useState(false);
  return (
    <form
      action={action}
      method="post"
      className="channel-consent"
      onSubmit={() => setPending(true)}
    >
      {children}
      <button
        className="jt-button jt-button--primary"
        type="submit"
        disabled={!canConnect || pending}
      >
        {pending ? pendingLabel : buttonLabel}
      </button>
      {unavailableMessage ? <small>{unavailableMessage}</small> : null}
    </form>
  );
}
