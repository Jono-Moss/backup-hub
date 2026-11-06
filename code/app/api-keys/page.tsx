import { listApiKeys, listTasksForPicker } from "./actions";
import { CreateApiKeyForm } from "@/components/ui/api-keys/CreateApiKeyForm";
import { RevokeApiKeyButton } from "@/components/ui/api-keys/RevokeApiKeyButton";
import { StandardBadge } from "@/components/ui/standard/StandardBadge";
import { StandardEntryCard, StandardEntryList } from "@/components/ui/standard/StandardEntryCard";
import { AddableSection } from "@/components/ui/common/AddableSection";
import { scopeLabel } from "@/components/ui/api-keys/scopeOptions";
import { LuKeyRound } from "react-icons/lu";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const [keys, tasks] = await Promise.all([listApiKeys(), listTasksForPicker()]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink mb-1">API keys</h1>
        <p className="text-sm text-muted">
          Used by external apps to call the REST API at <code className="font-mono text-xs">/api/v1/*</code>. Each
          key carries its own scopes and can be pinned to a single task. A key acts as you: it can never do more on
          a task than you can, and it stops working on a task if that task is unshared from you.
        </p>
      </div>

      <AddableSection
        id="keys"
        title="Your API keys"
        icon={<LuKeyRound />}
        count={keys.length}
        description="Revoke a key as soon as the app using it no longer needs access."
        canAdd
        addLabel="Create key"
        panelTitle="New API key"
        tabs={[{ key: "new", label: "Create new", content: <CreateApiKeyForm tasks={tasks} /> }]}
        emptyMessage="No API keys yet."
        // The new key is shown once in the panel; it closes when you click Done.
        closeOnAdd={false}
      >
        <StandardEntryList>
          {keys.map((key) => (
            <StandardEntryCard
              key={key.id}
              title={key.name}
              meta={<span className="font-mono">{key.keyPrefix}…</span>}
              badges={
                <>
                  <StandardBadge tone="primary">{key.taskId ? "One task" : "All tasks"}</StandardBadge>
                  {key.scopes.map((s) => (
                    <StandardBadge key={s}>{scopeLabel(s)}</StandardBadge>
                  ))}
                </>
              }
              actions={<RevokeApiKeyButton id={key.id} />}
            />
          ))}
        </StandardEntryList>
      </AddableSection>
    </div>
  );
}
