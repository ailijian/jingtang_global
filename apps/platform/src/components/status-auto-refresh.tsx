"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function StatusAutoRefresh({
  enabled,
  intervalMs = 1_000,
}: {
  readonly enabled: boolean;
  readonly intervalMs?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => router.refresh(), intervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, intervalMs, router]);
  return null;
}
