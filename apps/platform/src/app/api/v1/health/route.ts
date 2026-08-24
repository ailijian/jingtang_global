import { NextResponse } from "next/server";

import { getRuntime } from "../../../../server/runtime";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const runtime = getRuntime();
    await runtime.db.$queryRaw`
      SELECT 1
      FROM "outbox_messages"
      WHERE "state" IN (
        'dispatching'::"outbox_state",
        'dispatched'::"outbox_state"
      )
      LIMIT 0
    `;
    return NextResponse.json(
      { status: "ready", service: "platform", environment: runtime.config.APP_ENV },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "unavailable", service: "platform" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
