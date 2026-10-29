"use client";

import { useState } from "react";
import { deleteChannelById, makeChannelReusable, testChannel } from "@/app/notification-channels/actions";
import { StandardActionButton } from "./standard/StandardActionButton";

export function TestChannelButton({ id }: { id: string }) {
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  return (
    <div className="flex items-center gap-2">
      <StandardActionButton
        action={async () => setResult(await testChannel(id))}
        title="Send test"
        variant="outline"
        pendingTitle="Sending…"
        compact
      />
      {result && (
        <span className={`text-xs ${result.ok ? "text-primary" : "text-danger"}`}>
          {result.ok ? "Sent" : `Failed: ${result.message ?? "unknown error"}`}
        </span>
      )}
    </div>
  );
}

export function DeleteChannelButton({ id, usedByCount }: { id: string; usedByCount: number }) {
  return (
    <StandardActionButton
      action={() => deleteChannelById(id)}
      title="Delete"
      variant="danger"
      pendingTitle="Deleting…"
      confirmMessage={
        usedByCount > 0
          ? `Delete this notification channel and its saved settings? ${usedByCount} task${usedByCount === 1 ? "" : "s"} will stop notifying it.`
          : "Delete this notification channel and its saved settings?"
      }
      compact
    />
  );
}

export function MakeChannelReusableButton({ id }: { id: string }) {
  return (
    <StandardActionButton
      action={() => makeChannelReusable(id)}
      title="Make reusable"
      variant="outline"
      pendingTitle="Saving…"
      confirmMessage="Save this channel to your account so your other tasks can use it too? This can't be undone — once other tasks use it, it can't go back to task-only."
      compact
    />
  );
}
