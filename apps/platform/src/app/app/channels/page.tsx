import {
  allowsFacebookReviewOAuth,
  allowsTikTokReviewOAuth,
  allowsYouTubeTestOAuth,
} from "@jingtang/application";
import {
  listFacebookChannels,
  listInstagramChannels,
  listTikTokChannels,
  listYouTubeChannels,
  readFacebookConnectionCandidate,
} from "@jingtang/db";
import { hasPermission } from "@jingtang/domain";
import { translate } from "@jingtang/i18n";

import { DestructiveActionDialog } from "../../../components/destructive-action-dialog";
import { ChannelConnectionForm } from "../../../components/channel-connection-form";
import { StatusAutoRefresh } from "../../../components/status-auto-refresh";
import { workspacePageContext } from "../../../server/page-context";
import { getRuntime } from "../../../server/runtime";
import { hasDisconnectFailure } from "./disconnect-state";

export default async function ChannelsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    readonly youtube?: string | readonly string[];
    readonly facebook?: string | readonly string[];
    readonly instagram?: string | readonly string[];
    readonly tiktok?: string | readonly string[];
  }>;
}) {
  const [{ locale, role, workspaceId, session }, query] = await Promise.all([
    workspacePageContext(),
    searchParams,
  ]);
  const runtime = getRuntime();
  const [channels, facebookChannels, instagramChannels, tiktokChannels, facebookCandidate] =
    await Promise.all([
      listYouTubeChannels(runtime.db, workspaceId),
      listFacebookChannels(runtime.db, workspaceId),
      listInstagramChannels(runtime.db, workspaceId),
      listTikTokChannels(runtime.db, workspaceId),
      readFacebookConnectionCandidate(runtime.db, workspaceId, session.user.id),
    ]);
  const result = typeof query.youtube === "string" ? query.youtube : undefined;
  const facebookResult = typeof query.facebook === "string" ? query.facebook : undefined;
  const instagramResult = typeof query.instagram === "string" ? query.instagram : undefined;
  const tiktokResult = typeof query.tiktok === "string" ? query.tiktok : undefined;
  const connected = channels.find((channel) => channel.state === "connected");
  const reauthorization = channels.find((channel) => channel.state === "reauthorization_required");
  const disconnecting = channels.find((channel) => channel.state === "disconnecting");
  const disconnected = channels.find((channel) => channel.state === "disconnected");
  const disconnectFailed = hasDisconnectFailure(disconnecting?.revokeFailureCategory);
  const disconnectCompleted = result === "disconnecting" && Boolean(disconnected);
  const activeChannel = connected ?? disconnecting ?? reauthorization;
  const canConnect =
    hasPermission(role, "channel.connect") &&
    runtime.config.YOUTUBE_OAUTH_ENABLED &&
    allowsYouTubeTestOAuth(runtime.config.APP_ENV);
  const canDisconnect = hasPermission(role, "channel.disconnect");
  const facebookConnected = facebookChannels.find((channel) => channel.state === "connected");
  const facebookReauthorization = facebookChannels.find(
    (channel) => channel.state === "reauthorization_required",
  );
  const facebookDisconnecting = facebookChannels.find(
    (channel) => channel.state === "disconnecting",
  );
  const facebookDisconnected = facebookChannels.find((channel) => channel.state === "disconnected");
  const facebookDisconnectCompleted =
    facebookResult === "disconnecting" && Boolean(facebookDisconnected);
  const facebookActive = facebookConnected ?? facebookDisconnecting ?? facebookReauthorization;
  const canConnectFacebook =
    hasPermission(role, "channel.connect") &&
    runtime.config.FACEBOOK_OAUTH_ENABLED &&
    allowsFacebookReviewOAuth(runtime.config.APP_ENV);
  const tiktokConnected = tiktokChannels.find((channel) => channel.state === "connected");
  const tiktokReauthorization = tiktokChannels.find(
    (channel) => channel.state === "reauthorization_required",
  );
  const tiktokDisconnecting = tiktokChannels.find((channel) => channel.state === "disconnecting");
  const tiktokDisconnected = tiktokChannels.find((channel) => channel.state === "disconnected");
  const tiktokDisconnectFailed = hasDisconnectFailure(tiktokDisconnecting?.revokeFailureCategory);
  const tiktokDisconnectCompleted = tiktokResult === "disconnecting" && Boolean(tiktokDisconnected);
  const tiktokActive = tiktokConnected ?? tiktokDisconnecting ?? tiktokReauthorization;
  const canConnectTikTok =
    hasPermission(role, "channel.connect") &&
    runtime.config.TIKTOK_OAUTH_ENABLED &&
    allowsTikTokReviewOAuth(runtime.config.APP_ENV);
  const instagramConnected = instagramChannels.find((channel) => channel.state === "connected");
  const instagramConnecting = instagramChannels.find((channel) => channel.state === "connecting");
  const instagramReauthorization = instagramChannels.find(
    (channel) => channel.state === "reauthorization_required",
  );
  const instagramDisconnected = instagramChannels.find(
    (channel) => channel.state === "disconnected",
  );
  const instagramRemovalPending =
    instagramDisconnected?.providerRemovalState === "pending_user_action";
  const instagramRemovalConfirmed = instagramDisconnected?.providerRemovalState === "confirmed";
  const instagramActive =
    instagramConnected ?? instagramConnecting ?? instagramReauthorization ?? instagramDisconnected;
  const legalLocale = locale === "zh-CN" ? "zh-cn" : "en";
  const connectionForm = (
    <>
      <p>{translate(locale, "channel.oauth.help")}</p>
      <ul className="channel-scope-list">
        <li>{translate(locale, "channel.scope.upload")}</li>
        <li>{translate(locale, "channel.scope.readonly")}</li>
      </ul>
      <p className="channel-limitation">{translate(locale, "channel.privateOnly")}</p>
      <ChannelConnectionForm
        canConnect={canConnect}
        buttonLabel={translate(locale, reauthorization ? "channel.reauthorize" : "channel.connect")}
        pendingLabel={translate(locale, "channel.connect.pending")}
        unavailableMessage={
          !canConnect
            ? hasPermission(role, "channel.connect")
              ? translate(locale, "channel.notEnabled")
              : translate(locale, "permission.denied")
            : undefined
        }
      >
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
      </ChannelConnectionForm>
    </>
  );
  const facebookConnectionForm = (
    <>
      <p>
        {locale === "zh-CN"
          ? "Meta 官方 OAuth 将请求三项最小 Page 权限。JINGTANG 不会索取你的 Facebook 密码。"
          : "Meta OAuth requests the three minimum Page permissions. JINGTANG never asks for your Facebook password."}
      </p>
      <ul className="channel-scope-list">
        <li>
          pages_show_list — {locale === "zh-CN" ? "列出你管理的 Page" : "list Pages you manage"}
        </li>
        <li>
          pages_read_engagement — {locale === "zh-CN" ? "读取发布结果" : "read publish results"}
        </li>
        <li>
          pages_manage_posts —{" "}
          {locale === "zh-CN"
            ? "创建确认后的 Page 视频帖子"
            : "create the confirmed Page video post"}
        </li>
      </ul>
      <ChannelConnectionForm
        action="/api/v1/channels/facebook/oauth"
        canConnect={canConnectFacebook}
        buttonLabel={
          facebookReauthorization
            ? locale === "zh-CN"
              ? "重新连接 Facebook Page"
              : "Reconnect Facebook Page"
            : locale === "zh-CN"
              ? "连接 Facebook Page"
              : "Connect Facebook Page"
        }
        pendingLabel={locale === "zh-CN" ? "正在打开 Meta…" : "Opening Meta…"}
        unavailableMessage={
          canConnectFacebook
            ? undefined
            : hasPermission(role, "channel.connect")
              ? locale === "zh-CN"
                ? "Facebook 连接当前不可用。"
                : "Facebook connection is not available right now."
              : translate(locale, "permission.denied")
        }
      >
        <label>
          <input name="consent" type="checkbox" value="accepted" required />
          <span>
            {locale === "zh-CN"
              ? "我理解以上数据用途，并同意当前服务条款与隐私政策。"
              : "I understand this data purpose and agree to the current Terms and Privacy Policy."}
          </span>
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
          <a href="https://www.facebook.com/legal/terms" target="_blank" rel="noreferrer">
            Meta Terms
          </a>
        </p>
      </ChannelConnectionForm>
    </>
  );
  const tiktokConnectionForm = (
    <>
      <p>
        {locale === "zh-CN"
          ? "TikTok Login Kit 仅请求 user.info.basic 与 video.publish。当前仅连接私密账号，并由用户手动选择 SELF_ONLY 发布。"
          : "TikTok Login Kit requests user.info.basic and video.publish only. Current access is limited to private accounts with manual SELF_ONLY publishing."}
      </p>
      <ul className="channel-scope-list">
        <li>
          user.info.basic —{" "}
          {locale === "zh-CN" ? "显示已连接身份" : "display the connected identity"}
        </li>
        <li>
          video.publish —{" "}
          {locale === "zh-CN"
            ? "发布明确确认的私密视频"
            : "publish explicitly confirmed private videos"}
        </li>
      </ul>
      <ChannelConnectionForm
        action="/api/v1/channels/tiktok/oauth"
        canConnect={canConnectTikTok}
        buttonLabel={
          tiktokReauthorization
            ? locale === "zh-CN"
              ? "重新连接 TikTok"
              : "Reconnect TikTok"
            : locale === "zh-CN"
              ? "连接 TikTok"
              : "Connect TikTok"
        }
        pendingLabel={locale === "zh-CN" ? "正在打开 TikTok…" : "Opening TikTok…"}
        unavailableMessage={
          canConnectTikTok
            ? undefined
            : hasPermission(role, "channel.connect")
              ? locale === "zh-CN"
                ? "当前服务尚未为此账号启用 TikTok 连接。"
                : "TikTok connection is not enabled for this account."
              : translate(locale, "permission.denied")
        }
      >
        <label>
          <input name="consent" type="checkbox" value="accepted" required />
          <span>
            {locale === "zh-CN"
              ? "我理解以上用途，并同意当前服务条款、隐私政策与 TikTok 条款。"
              : "I understand this purpose and agree to the current Terms, Privacy Policy, and TikTok Terms."}
          </span>
        </label>
        <p>
          <a href={`https://jingtangai.com/${legalLocale}/terms/`} target="_blank" rel="noreferrer">
            {translate(locale, "consent.terms")}
          </a>
          {" · "}
          <a
            href={`https://jingtangai.com/${legalLocale}/privacy/`}
            target="_blank"
            rel="noreferrer"
          >
            {translate(locale, "consent.privacy")}
          </a>
          {" · "}
          <a href="https://www.tiktok.com/legal/terms-of-service" target="_blank" rel="noreferrer">
            TikTok Terms
          </a>
        </p>
      </ChannelConnectionForm>
    </>
  );
  return (
    <>
      <StatusAutoRefresh
        enabled={
          (result === "disconnecting" && Boolean(disconnecting) && !disconnectFailed) ||
          (facebookResult === "disconnecting" &&
            Boolean(facebookDisconnecting) &&
            !facebookDisconnectCompleted) ||
          (tiktokResult === "disconnecting" &&
            Boolean(tiktokDisconnecting) &&
            !tiktokDisconnectFailed &&
            !tiktokDisconnectCompleted) ||
          Boolean(instagramRemovalPending)
        }
      />
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
        {result === "disconnected" || disconnectCompleted ? (
          <p className="channel-notice channel-notice--success" role="status">
            {translate(locale, "channel.result.disconnected")}
          </p>
        ) : null}
        {result === "disconnecting" && !disconnectFailed && !disconnectCompleted ? (
          <p className="channel-notice" role="status">
            {translate(locale, "channel.result.disconnecting")}
          </p>
        ) : null}
        {result === "disconnect_failed" || disconnectFailed ? (
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
              <p className="detail-kicker">YOUTUBE · CONTROLLED PUBLISHING</p>
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
        <section className="channel-card" aria-labelledby="tiktok-channel-title">
          <div className="channel-card__heading">
            <div>
              <p className="detail-kicker">TIKTOK · CONTROLLED PRIVATE PUBLISHING</p>
              <h2 id="tiktok-channel-title">TikTok</h2>
            </div>
            <span
              className={`channel-status channel-status--${tiktokConnected ? "connected" : "pending"}`}
            >
              {tiktokConnected
                ? translate(locale, "channel.status.connected")
                : tiktokDisconnecting
                  ? translate(locale, "channel.status.disconnecting")
                  : tiktokReauthorization
                    ? translate(locale, "channel.status.reauthorization")
                    : locale === "zh-CN"
                      ? "未连接"
                      : "Not connected"}
            </span>
          </div>
          {tiktokResult === "connected" ? (
            <p className="channel-notice channel-notice--success">
              {locale === "zh-CN"
                ? "TikTok 私密账号已连接；发布仍需审批与 SELF_ONLY 单独确认。"
                : "The private TikTok account is connected; publishing still requires approval and a separate SELF_ONLY confirmation."}
            </p>
          ) : null}
          {tiktokResult === "failed" ||
          tiktokResult === "disconnect_failed" ||
          tiktokDisconnectFailed ? (
            <p className="channel-notice channel-notice--error" role="alert">
              {locale === "zh-CN"
                ? "TikTok 已停止新操作，但授权清理尚未完成。请重试断开；历史帖子不会被删除。"
                : "New TikTok operations are blocked, but authorization cleanup is not complete. Retry disconnecting; historical posts are not deleted."}
            </p>
          ) : null}
          {tiktokResult === "denied" ? (
            <p className="channel-notice">
              {locale === "zh-CN" ? "TikTok 授权已取消。" : "TikTok authorization was cancelled."}
            </p>
          ) : null}
          {tiktokResult === "disconnected" || tiktokDisconnectCompleted ? (
            <p className="channel-notice channel-notice--success">
              {locale === "zh-CN"
                ? "TikTok 授权已撤销并清理。"
                : "TikTok authorization was revoked and cleaned up."}
            </p>
          ) : null}
          {tiktokResult === "disconnecting" &&
          !tiktokDisconnectFailed &&
          !tiktokDisconnectCompleted ? (
            <p className="channel-notice" role="status">
              {locale === "zh-CN"
                ? "正在撤销 TikTok 授权、销毁令牌密钥并清理本地授权数据。页面会自动更新。"
                : "TikTok authorization is being revoked, its token key retired, and local authorization data cleaned up. This page updates automatically."}
            </p>
          ) : null}
          {tiktokActive ? (
            <div className="channel-identity">
              <strong>{tiktokActive.displayName ?? "TikTok"}</strong>
              {tiktokActive.externalAccountId ? (
                <span>{tiktokActive.externalAccountId}</span>
              ) : null}
              <p>
                {locale === "zh-CN"
                  ? "当前只允许受限 PULL_FROM_URL、手动 SELF_ONLY，互动默认关闭。"
                  : "Current access permits provider-only PULL_FROM_URL and manual SELF_ONLY only, with interactions off by default."}
              </p>
              {(tiktokConnected || tiktokDisconnecting) && canDisconnect ? (
                <DestructiveActionDialog
                  action="/api/v1/channels/tiktok/disconnect"
                  triggerLabel={
                    tiktokDisconnecting
                      ? locale === "zh-CN"
                        ? "重试断开 TikTok"
                        : "Retry disconnecting TikTok"
                      : locale === "zh-CN"
                        ? "断开 TikTok"
                        : "Disconnect TikTok"
                  }
                  title={
                    locale === "zh-CN"
                      ? "断开这个 TikTok 账号？"
                      : "Disconnect this TikTok account?"
                  }
                  description={
                    locale === "zh-CN"
                      ? "将阻止新发布、撤销授权并删除保存的 token。"
                      : "This blocks new publishes, revokes authorization, and deletes stored tokens."
                  }
                  consequences={[
                    locale === "zh-CN"
                      ? "新的 TikTok API 操作立即停止。"
                      : "New TikTok API operations stop immediately.",
                    locale === "zh-CN"
                      ? "保存的 OAuth token 会被删除。"
                      : "Stored OAuth tokens are deleted.",
                    locale === "zh-CN"
                      ? "TikTok 已持有的视频不会被删除。"
                      : "Videos already held by TikTok are not deleted.",
                  ]}
                  submitLabel={locale === "zh-CN" ? "确认断开" : "Disconnect TikTok"}
                  pendingLabel={translate(locale, "channel.disconnect.pending")}
                  cancelLabel={translate(locale, "action.cancel")}
                  hiddenFields={{ channel_id: tiktokActive.id, confirmation: "disconnect" }}
                />
              ) : null}
              {tiktokReauthorization ? tiktokConnectionForm : null}
            </div>
          ) : (
            tiktokConnectionForm
          )}
        </section>
        <section className="channel-card" aria-labelledby="facebook-channel-title">
          <div className="channel-card__heading">
            <div>
              <p className="detail-kicker">FACEBOOK · PAGE VIDEO PUBLISHING</p>
              <h2 id="facebook-channel-title">Facebook</h2>
            </div>
            <span
              className={`channel-status channel-status--${facebookConnected ? "connected" : "pending"}`}
            >
              {facebookConnected
                ? translate(locale, "channel.status.connected")
                : facebookDisconnecting
                  ? translate(locale, "channel.status.disconnecting")
                  : facebookReauthorization
                    ? translate(locale, "channel.status.reauthorization")
                    : facebookDisconnected
                      ? translate(locale, "channel.status.disconnected")
                      : locale === "zh-CN"
                        ? "未连接"
                        : "Not connected"}
            </span>
          </div>
          {facebookResult === "connected" ? (
            <p className="channel-notice channel-notice--success">
              {locale === "zh-CN"
                ? "Facebook Page 已连接。发布仍需审批和单独确认。"
                : "The Facebook Page is connected. Publishing still requires approval and a separate confirmation."}
            </p>
          ) : null}
          {facebookResult === "denied" ? (
            <p className="channel-notice">
              {locale === "zh-CN"
                ? "Facebook 授权已取消，没有连接 Page。"
                : "Facebook authorization was cancelled. No Page was connected."}
            </p>
          ) : null}
          {facebookResult === "failed" || facebookResult === "disconnect_failed" ? (
            <p className="channel-notice channel-notice--error">
              {locale === "zh-CN"
                ? "Facebook 操作未能安全完成，请重试。"
                : "The Facebook operation could not be completed safely. Try again."}
            </p>
          ) : null}
          {facebookResult === "disconnected" || facebookDisconnectCompleted ? (
            <p className="channel-notice channel-notice--success">
              {locale === "zh-CN"
                ? "Facebook 授权已撤销，保存的连接数据已删除。"
                : "Facebook authorization was revoked and stored connection data was deleted."}
            </p>
          ) : null}
          {facebookResult === "disconnecting" && !facebookDisconnectCompleted ? (
            <p className="channel-notice">
              {locale === "zh-CN"
                ? "正在撤销 Facebook 授权并清理本地授权数据。"
                : "Facebook authorization revocation and local Authorized Data cleanup are in progress."}
            </p>
          ) : null}
          {facebookResult === "select" && facebookCandidate ? (
            <form
              action="/api/v1/channels/facebook/select"
              method="post"
              className="channel-consent"
            >
              <h3>{locale === "zh-CN" ? "选择唯一发布目标 Page" : "Select the one target Page"}</h3>
              <p>
                {locale === "zh-CN"
                  ? `已授权身份：${facebookCandidate.metaUserDisplayName}。未选择 Page 的 token 将立即销毁。`
                  : `Authorized identity: ${facebookCandidate.metaUserDisplayName}. Tokens for unselected Pages are destroyed immediately.`}
              </p>
              <input type="hidden" name="candidate_id" value={facebookCandidate.id} />
              <label className="content-field">
                <span>{locale === "zh-CN" ? "Facebook Page" : "Facebook Page"}</span>
                <select name="page_id" required defaultValue="">
                  <option value="" disabled>
                    {locale === "zh-CN" ? "请选择 Page" : "Select a Page"}
                  </option>
                  {facebookCandidate.pages.map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.displayName} · {page.id}
                    </option>
                  ))}
                </select>
              </label>
              <button className="jt-button jt-button--primary" type="submit">
                {locale === "zh-CN" ? "连接所选 Page" : "Connect selected Page"}
              </button>
            </form>
          ) : facebookActive ? (
            <div className="channel-identity">
              <strong>{facebookActive.displayName ?? "Facebook Page"}</strong>
              {facebookActive.externalAccountId ? (
                <span>{facebookActive.externalAccountId}</span>
              ) : null}
              <p>
                {locale === "zh-CN"
                  ? "授权仅用于列出管理的 Page、读取发布状态，并在明确确认后创建 Page 帖子。"
                  : "Authorization is used only to list managed Pages, read publish status, and create a Page post after explicit confirmation."}
              </p>
              {(facebookConnected || facebookDisconnecting) && canDisconnect ? (
                <DestructiveActionDialog
                  action="/api/v1/channels/facebook/disconnect"
                  triggerLabel={locale === "zh-CN" ? "断开 Facebook" : "Disconnect Facebook"}
                  title={
                    locale === "zh-CN"
                      ? "断开这个 Facebook Page？"
                      : "Disconnect this Facebook Page?"
                  }
                  description={
                    locale === "zh-CN"
                      ? "JINGTANG 会阻止新发布、撤销 Meta 授权并删除保存的 token 与授权数据。"
                      : "JINGTANG blocks new publishes, revokes Meta authorization, and deletes stored tokens and Authorized Data."
                  }
                  consequences={[
                    locale === "zh-CN"
                      ? "新的 Facebook API 操作立即停止。"
                      : "New Facebook API operations stop immediately.",
                    locale === "zh-CN"
                      ? "保存的 OAuth token 与授权数据会被删除。"
                      : "Stored OAuth tokens and Authorized Data are deleted.",
                    locale === "zh-CN"
                      ? "Facebook 已持有的视频不会被删除。"
                      : "Videos already held by Facebook are not deleted.",
                  ]}
                  submitLabel={locale === "zh-CN" ? "确认断开" : "Disconnect Facebook"}
                  pendingLabel={translate(locale, "channel.disconnect.pending")}
                  cancelLabel={translate(locale, "action.cancel")}
                  hiddenFields={{ channel_id: facebookActive.id, confirmation: "disconnect" }}
                />
              ) : null}
              {facebookReauthorization ? facebookConnectionForm : null}
            </div>
          ) : (
            facebookConnectionForm
          )}
        </section>
        <section className="channel-card" aria-labelledby="instagram-channel-title">
          <div className="channel-card__heading">
            <div>
              <p className="detail-kicker">INSTAGRAM · CONTROLLED REELS PUBLISHING</p>
              <h2 id="instagram-channel-title">Instagram</h2>
            </div>
            <span
              className={`channel-status channel-status--${instagramConnected || instagramRemovalConfirmed ? "connected" : "pending"}`}
            >
              {instagramConnected
                ? translate(locale, "channel.status.connected")
                : instagramConnecting
                  ? locale === "zh-CN"
                    ? "连接中"
                    : "Connecting"
                  : instagramRemovalPending
                    ? locale === "zh-CN"
                      ? "等待 Instagram 移除"
                      : "Instagram removal pending"
                    : instagramRemovalConfirmed
                      ? locale === "zh-CN"
                        ? "平台侧撤销已确认"
                        : "Provider revocation confirmed"
                      : locale === "zh-CN"
                        ? "未连接"
                        : "Not connected"}
            </span>
          </div>
          {instagramResult === "disconnect_failed" ? (
            <p className="channel-notice channel-notice--error" role="alert">
              {locale === "zh-CN"
                ? "Instagram 本地断开未能安全完成；没有发起任何 Meta 撤销调用。请重试。"
                : "The Instagram local disconnect did not complete safely. No Meta revocation call was made; try again."}
            </p>
          ) : null}
          {instagramRemovalPending ? (
            <div className="channel-notice" role="status" aria-live="polite">
              <strong>
                {locale === "zh-CN"
                  ? "JINGTANG 已在本地断开——请在 Instagram 移除 App"
                  : "JINGTANG is locally disconnected — remove the App in Instagram"}
              </strong>
              <p>
                {locale === "zh-CN"
                  ? "本地 token、账号授权数据和新操作已清理/停止；这不代表 Meta 侧授权已经撤销。"
                  : "Local tokens, account authorization data, and new operations are cleared or stopped. This does not mean Meta-side authorization has been revoked."}
              </p>
              <p>
                <strong>
                  Instagram → Website permissions → Apps and websites → Active → Remove
                </strong>
              </p>
              <small>
                {locale === "zh-CN"
                  ? "只有验证 deauthorization callback 后，页面才会显示平台侧撤销已确认；页面会自动更新。"
                  : "Provider revocation is shown as confirmed only after a verified deauthorization callback. This page refreshes automatically."}
              </small>
            </div>
          ) : null}
          {instagramRemovalConfirmed ? (
            <p className="channel-notice channel-notice--success" role="status">
              {locale === "zh-CN"
                ? "平台侧撤销已确认。此状态仅来自已验证的 Instagram deauthorization callback。"
                : "Provider revocation is confirmed. This state comes only from a verified Instagram deauthorization callback."}
            </p>
          ) : null}
          {instagramConnected ? (
            <div className="channel-identity">
              <strong>@{instagramConnected.displayName ?? "Instagram"}</strong>
              {instagramConnected.externalAccountId ? (
                <span>{instagramConnected.externalAccountId}</span>
              ) : null}
              <p>
                {locale === "zh-CN"
                  ? "仅限一个 Professional 账号、一个明确确认的 MP4 Reel、REELS、share_to_feed=false 与立即发布。"
                  : "Limited to one Professional account and one explicitly confirmed MP4 Reel using REELS, share_to_feed=false, and Publish Now."}
              </p>
              {canDisconnect ? (
                <DestructiveActionDialog
                  action="/api/v1/channels/instagram/disconnect"
                  triggerLabel={locale === "zh-CN" ? "断开 Instagram" : "Disconnect Instagram"}
                  title={
                    locale === "zh-CN"
                      ? "在 JINGTANG 本地断开 Instagram？"
                      : "Disconnect Instagram locally in JINGTANG?"
                  }
                  description={
                    locale === "zh-CN"
                      ? "JINGTANG 会立即禁止新操作、取消排队工作、删除本地 token 与账号授权数据；随后仍需你在 Instagram 移除 App。"
                      : "JINGTANG immediately blocks new operations, cancels queued work, and deletes local tokens and account authorization data. You must then remove the App in Instagram."
                  }
                  consequences={[
                    locale === "zh-CN"
                      ? "JINGTANG 不会调用 Facebook Login 的程序化 revoke。"
                      : "JINGTANG does not call Facebook Login's programmatic revoke.",
                    locale === "zh-CN"
                      ? "在 callback 确认前，状态保持等待 Instagram 移除。"
                      : "The state remains removal pending until callback confirmation.",
                    locale === "zh-CN"
                      ? "Instagram 已托管的 Reel 不会被删除。"
                      : "Reels already hosted by Instagram are not deleted.",
                  ]}
                  submitLabel={locale === "zh-CN" ? "确认本地断开" : "Disconnect locally"}
                  pendingLabel={translate(locale, "channel.disconnect.pending")}
                  cancelLabel={translate(locale, "action.cancel")}
                  hiddenFields={{ channel_id: instagramConnected.id, confirmation: "disconnect" }}
                />
              ) : null}
            </div>
          ) : instagramActive && !instagramDisconnected ? (
            <p className="channel-notice">
              {locale === "zh-CN"
                ? "Instagram 连接尚未完成；当前候选不使用任何 Meta 凭证。"
                : "Instagram connection is not complete. This candidate uses no Meta credential."}
            </p>
          ) : !instagramDisconnected ? (
            <div className="channel-consent">
              <p>
                {locale === "zh-CN"
                  ? "本地候选已冻结以下最小权限与 UI 边界；在 callback/COS 证据和独立 App 配置通过后才可启用连接。"
                  : "The local candidate freezes the minimum permissions and UI boundary below. Connection remains disabled until callback/COS evidence and dedicated App configuration pass."}
              </p>
              <ul className="channel-scope-list">
                <li>instagram_business_basic — user_id, username</li>
                <li>instagram_business_content_publish — one confirmed MP4 Reel</li>
              </ul>
              <button className="jt-button jt-button--primary" type="button" disabled>
                {locale === "zh-CN" ? "连接 Instagram" : "Connect Instagram"}
              </button>
              <small>
                {locale === "zh-CN"
                  ? "当前不可用：未配置 Meta App、外部凭证或 provider-dependent callback。"
                  : "Unavailable: no Meta App, external credential, or provider-dependent callback is configured."}
              </small>
            </div>
          ) : null}
        </section>
      </div>
    </>
  );
}
