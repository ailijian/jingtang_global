import { getRuntime } from "../../../../../server/runtime";
import { serveTikTokMedia } from "../../../../../server/tiktok-media";

export const dynamic = "force-dynamic";

function serve(request: Request): Promise<Response> {
  const runtime = getRuntime();
  if (!runtime.tiktokMediaAccess) return Promise.resolve(new Response(null, { status: 404 }));
  return serveTikTokMedia(request, {
    codec: runtime.tiktokMediaAccess,
    assets: runtime.assets,
  });
}

export function GET(request: Request): Promise<Response> {
  return serve(request);
}

export function HEAD(request: Request): Promise<Response> {
  return serve(request);
}
