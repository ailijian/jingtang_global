import { listYouTubeChannels } from "@jingtang/db";
import { hasPermission } from "@jingtang/domain";
import { translate } from "@jingtang/i18n";

import { DestructiveActionDialog } from "../../../components/destructive-action-dialog";
import { workspacePageContext } from "../../../server/page-context";
import { getRuntime } from "../../../server/runtime";

export default async function ChannelsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly youtube?: string | readonly string[] }>;
}) {
  const [{ locale, role, workspaceId }, query] = await Promise.all([
    workspacePageContext(),
    searchParams,
  ]);
  const runtime = getRuntime();
  const channels = await listYouTubeChannels(runtime.db, workspaceId);
  const connected = channels.find((channel) => channel.state === "connected");
  const reauthorization = channels.find((channel) => channel.state === "reauthorization_required");
  const disconnecting = channels.find((channel) => channel.state === "disconnecting");
  const disconnected = channels.find((channel) => channel.state === "disconnected");
  const activeChannel = connected ?? disconnecting ?? reauthorization;
  const result = typeof query.youtube === "string" ? query.youtube : undefined;
  const canConnect =
    hasPermission(role, "channel.connect") &&
    runtime.config.YOUTUBE_OAUTH_ENABLED &&
    (runtime.config.APP_ENV === "local" || runtime.config.APP_ENV === "test");
  const canDisconnect = hasPermission(role, "channel.disconnect");
  const legalLocale = locale === "zh-CN" ? "zh-cn" : "en";
  const connectionForm = (
    <>
      <p>{translate(locale, "channel.oauth.help")}</p>
      <ul className="channel-scope-list">
        <li>{translate(locale, "channel.scope.upload")}</li>
        <li>{translate(locale, "channel.scope.readonly")}</li>
      </ul>
      <p className="channel-limitation">{translate(locale, "channel.privateOnly")}</p>
      <form action="/api/v1/channels/youtube/oauth" method="post" className="channel-consent">
        <label>
          <input name="consent" type="checkbox" value="accepted" required />
          <span>{translate(locale, "channel.consent")}</span>
        </label>
        <p>
          <a href={`https://jingtangai.com/${legalLocale}/terms/`} target="_blank" rel="noreferrer">
            {translate(locale, "consent.terms")}
          </a>{" "}
          ·{" "}
          <a
            href={`https://jingtangai.com/${legalLocale}/privacy/`}
            target="_blank"
            rel="noreferrer"
          >
            {translate(locale, "consent.privacy")}
          </a>{" "}
          ·{" "}
          <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">
            {translate(locale, "channel.youtubeTerms")}
          </a>
          {" · "}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
            {translate(locale, "channel.googlePrivacy")}
          </a>
        </p>
        <button className="jt-button jt-button--primary" type="submit" disabled={!canConnect}>
          {translate(locale, reauthorization ? "channel.reauthorize" : "channel.connect")}
        </button>
        {!canConnect ? (
          <small>
            {hasPermission(role, "channel.connect")
              ? translate(locale, "channel.notEnabled")
              : translate(locale, "permission.denied")}
          </small>
        ) : null}
      </form>
    </>
  );
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">CHANNELS / YOUTUBE</p>
        <h1>{translate(locale, "channel.title")}</h1>
        <p>{translate(locale, "channel.description")}</p>
      </header>
      <div className="channel-stack">
        {result === "connected" ? (
          <p className="channel-notice channel-notice--success">
            {translate(locale, "channel.result.connected")}
          </p>
        ) : null}
        {result === "disconnected" ? (
          <p className="channel-notice channel-notice--success" role="status">
            {translate(locale, "channel.result.disconnected")}
          </p>
        ) : null}
        {result === "disconnecting" ? (
          <p className="channel-notice" role="status">
            {translate(locale, "channel.result.disconnecting")}
          </p>
        ) : null}
        {result === "disconnect_failed" ? (
          <p className="channel-notice channel-notice--error" role="alert">
            {translate(locale, "channel.result.disconnectFailed")}
          </p>
        ) : null}
        {result === "denied" ? (
          <p className="channel-notice">{translate(locale, "channel.result.denied")}</p>
        ) : null}
        {result === "failed" ? (
          <p className="channel-notice channel-notice--error">
            {translate(locale, "channel.result.failed")}
          </p>
        ) : null}
        <section className="channel-card" aria-labelledby="youtube-channel-title">
          <div className="channel-card__heading">
            <div>
              <p className="detail-kicker">YOUTUBE · TEST INTEGRATION</p>
              <h2 id="youtube-channel-title">YouTube</h2>
            </div>
            <span
              className={`channel-status channel-status--${connected ? "connected" : "pending"}`}
            >
              {translate(
                locale,
                connected
                  ? "channel.status.connected"
                  : disconnecting
                    ? "channel.status.disconnecting"
                    : reauthorization
                      ? "channel.status.reauthorization"
                      : disconnected
                        ? "channel.status.disconnected"
                        : "channel.status.test",
              )}
            </span>
          </div>
          {activeChannel ? (
            <>
              <div className="channel-identity">
                <strong>{activeChannel.displayName ?? "YouTube"}</strong>
                {activeChannel.externalAccountId ? (
                  <span>{activeChannel.externalAccountId}</span>
                ) : null}
                <p>{translate(locale, "channel.connected.help")}</p>
                {(connected || disconnecting) && canDisconnect ? (
                  <DestructiveActionDialog
                    action="/api/v1/channels/youtube/disconnect"
                    triggerLabel={translate(
                      locale,
                      disconnecting ? "channel.disconnect.retry" : "channel.disconnect.action",
                    )}
                    title={translate(locale, "channel.disconnect.title")}
                    description={translate(locale, "channel.disconnect.body")}
                    consequences={[
                      translate(locale, "channel.disconnect.effectAccess"),
                      translate(locale, "channel.disconnect.effectData"),
                      translate(locale, "channel.disconnect.effectThirdParty"),
                    ]}
                    submitLabel={translate(locale, "channel.disconnect.action")}
                    pendingLabel={translate(locale, "channel.disconnect.pending")}
                    cancelLabel={translate(locale, "action.cancel")}
                    hiddenFields={{ channel_id: activeChannel.id, confirmation: "disconnect" }}
                  />
                ) : null}
              </div>
              {reauthorization ? connectionForm : null}
            </>
          ) : (
            connectionForm
          )}
        </section>
      </div>
    </>
  );
}
