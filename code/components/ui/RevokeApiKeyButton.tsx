"use client";

import { revokeApiKey } from "@/app/api-keys/actions";
import { StandardActionButton } from "@/components/ui/standard/StandardActionButton";

export function RevokeApiKeyButton({ id }: { id: string }) {
  return (
    <StandardActionButton
      title="Revoke"
      variant="danger"
      pendingTitle="Revoking..."
      confirmMessage="Revoke this API key? Any app using it will immediately lose access."
      action={() => revokeApiKey(id)}
    />
  );
}