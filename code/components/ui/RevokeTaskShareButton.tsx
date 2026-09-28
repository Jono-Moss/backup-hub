"use client";

import { revokeTaskShare } from "@/app/tasks/actions";
import { StandardActionButton } from "./standard/StandardActionButton";

export function RevokeTaskShareButton({ taskId, shareId }: { taskId: string; shareId: string }) {
  const bound = revokeTaskShare.bind(null, taskId, shareId);

  return (
    <StandardActionButton
      action={bound}
      title="Remove"
      variant="danger"
      pendingTitle="Removing..."
      confirmMessage="Stop sharing this task with this user? Any API keys they made for it stop working too."
    />
  );
}
