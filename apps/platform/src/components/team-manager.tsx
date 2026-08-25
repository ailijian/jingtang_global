"use client";

import type { Locale, Role } from "@jingtang/domain";
import { translate } from "@jingtang/i18n";
import { Button, FormField, StatusMessage } from "@jingtang/ui";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Member = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: Role;
};
type Invitation = {
  readonly id: string;
  readonly email: string;
  readonly role: Role;
  readonly expiresAt: string;
};

const roles: readonly Role[] = ["owner_admin", "editor", "approver_publisher", "viewer"];

export function TeamManager({
  locale,
  members,
  invitations,
  canManage,
  currentUserId,
}: {
  locale: Locale;
  members: readonly (Member & { readonly userId: string })[];
  invitations: readonly Invitation[];
  canManage: boolean;
  currentUserId: string;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const router = useRouter();
  const [status, setStatus] = useState<{ tone: "success" | "danger"; text: string }>();
  const [busy, setBusy] = useState(false);
  const roleLabel: Record<Role, string> = {
    owner_admin: t("member.role.ownerAdmin"),
    editor: t("member.role.editor"),
    approver_publisher: t("member.role.approverPublisher"),
    viewer: t("member.role.viewer"),
  };

  async function mutate(path: string, method: string, payload?: object) {
    setBusy(true);
    setStatus(undefined);
    const requestInit: RequestInit = {
      method,
      ...(payload
        ? { headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }
        : {}),
    };
    const response = await fetch(path, requestInit);
    const body = (await response.json()) as {
      invitation?: { token?: string };
      error?: { code?: string };
    };
    if (!response.ok) {
      setStatus({
        tone: "danger",
        text:
          body.error?.code === "permission_denied"
            ? t("permission.denied")
            : body.error?.code === "last_owner"
              ? t("member.lastOwner")
              : t("member.failed"),
      });
    } else {
      const invitationToken = body.invitation?.token;
      setStatus({
        tone: "success",
        text: invitationToken
          ? `${t("member.testInvite")} /onboarding?invite=${invitationToken}`
          : t("member.changed"),
      });
      router.refresh();
    }
    setBusy(false);
  }

  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void mutate("/api/v1/invitations", "POST", {
      email: data.get("email"),
      role: data.get("role"),
    });
    event.currentTarget.reset();
  }

  return (
    <div className="team-stack">
      {status ? (
        <StatusMessage role="status" tone={status.tone}>
          {status.text}
        </StatusMessage>
      ) : null}
      {canManage ? (
        <form className="invite-form" onSubmit={invite}>
          <FormField
            id="invite-email"
            name="email"
            type="email"
            required
            label={t("member.invite.email")}
          />
          <label className="jt-field" htmlFor="invite-role">
            <span>{t("member.invite.role")}</span>
            <select id="invite-role" name="role" defaultValue="viewer">
              {roles.map((role) => (
                <option value={role} key={role}>
                  {roleLabel[role]}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={busy}>
            {t("member.invite.action")}
          </Button>
        </form>
      ) : (
        <StatusMessage tone="info">{t("member.viewOnly")}</StatusMessage>
      )}
      <div className="member-list">
        {members.map((member) => (
          <article className="member-row" key={member.id}>
            <div>
              <strong>
                {member.name}
                {member.userId === currentUserId ? ` ${t("member.you")}` : ""}
              </strong>
              <span>{member.email}</span>
            </div>
            {canManage ? (
              <div className="member-actions">
                <select
                  aria-label={`${t("member.role.action")}: ${member.name}`}
                  value={member.role}
                  disabled={busy}
                  onChange={(event) =>
                    void mutate(`/api/v1/members/${member.id}`, "PATCH", {
                      role: event.target.value,
                    })
                  }
                >
                  {roles.map((role) => (
                    <option value={role} key={role}>
                      {roleLabel[role]}
                    </option>
                  ))}
                </select>
                {member.userId !== currentUserId ? (
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={() => void mutate(`/api/v1/members/${member.id}`, "DELETE")}
                  >
                    {t("member.remove.action")}
                  </Button>
                ) : null}
              </div>
            ) : (
              <span className="role-badge">{roleLabel[member.role]}</span>
            )}
          </article>
        ))}
      </div>
      {invitations.length ? (
        <section>
          <h2>{t("member.pending")}</h2>
          {invitations.map((entry) => (
            <p className="pending-invite" key={entry.id}>
              {entry.email}
              <span>{roleLabel[entry.role]}</span>
            </p>
          ))}
        </section>
      ) : null}
    </div>
  );
}
