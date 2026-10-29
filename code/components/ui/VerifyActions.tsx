"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Per-backup check actions live in each backup's ⋯ menu (RunActions.tsx);
// "all backups" ones in BulkRunActions.tsx.

/** Refreshes the page every few seconds while checks are queued or running. */
export function RefreshWhileChecking({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [active, router]);
  return null;
}
