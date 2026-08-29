import { hasPermission } from "@jingtang/domain";
import {
  listFacebookChannels,
  listInstagramChannels,
  listTikTokChannels,
  listYouTubeChannels,
} from "@jingtang/db";
import { translate } from "@jingtang/i18n";
import { redirect } from "next/navigation";

import { ContentComposer } from "../../../../components/content-composer";
import { workspacePageContext } from "../../../../server/page-context";
import { getRuntime } from "../../../../server/runtime";

export default async function NewContentPage() {
  const { locale, role, workspaceId } = await workspacePageContext();
  if (!hasPermission(role, "content.create")) redirect("/app/content");
  const allChannels = await Promise.all([
    listYouTubeChannels(getRuntime().db, workspaceId),
    listFacebookChannels(getRuntime().db, workspaceId),
    listInstagramChannels(getRuntime().db, workspaceId),
    listTikTokChannels(getRuntime().db, workspaceId),
  ]);
  const channels = allChannels
    .flat()
    .filter(
      (channel) =>
        channel.state === "connected" && channel.externalAccountId && channel.displayName,
    )
    .map((channel) => ({
      id: channel.id,
      platform: channel.platform,
      externalAccountId: channel.externalAccountId ?? "",
      displayName: channel.displayName ?? "",
    }));
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">{translate(locale, "composer.eyebrow")}</p>
        <h1>{translate(locale, "composer.title")}</h1>
        <p>{translate(locale, "composer.description")}</p>
      </header>
      <ContentComposer locale={locale} workspaceId={workspaceId} channels={channels} />
    </>
  );
}
