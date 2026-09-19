import { listApiKeys, listTasksForPicker } from "./actions";
import { CreateApiKeyForm } from "@/components/ui/CreateApiKeyForm";
import { RevokeApiKeyButton } from "@/components/ui/RevokeApiKeyButton";
import { StandardSection } from "@/components/ui/standard/StandardSection";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const [keys, tasks] = await Promise.all([listApiKeys(), listTasksForPicker()]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink mb-1">API keys</h1>
        <p className="text-sm text-muted">
          Used by external apps to call the REST API at <code className="font-mono text-xs">/api/v1/*</code>. Each
          key carries its own scopes and can be pinned to a single task.
        </p>
      </div>

      <StandardSection WidthVariant="half">
        <CreateApiKeyForm tasks={tasks} />
      </StandardSection>

      <StandardSection>
        {keys.length === 0 ? (
          <p className="text-sm text-muted p-6">No API keys yet.</p>
        ) : (
          keys.map((key) => (
            <div key={key.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-medium text-ink">{key.name}</p>
                <p className="text-xs text-muted mt-0.5 font-mono">{key.keyPrefix}…</p>
                <p className="text-xs text-muted mt-1">
                  {key.scopes.join(", ")}
                  {key.taskId ? " · scoped to one task" : " · all tasks"}
                </p>
              </div>
              <RevokeApiKeyButton id={key.id} />
            </div>
          ))
        )}
      </StandardSection>
    </div>
  );
}
