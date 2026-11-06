import { listApiKeys, listTasksForPicker } from "./actions";
import { getTranslations } from "next-intl/server";
import { CreateApiKeyForm } from "@/components/ui/api-keys/CreateApiKeyForm";
import { RevokeApiKeyButton } from "@/components/ui/api-keys/RevokeApiKeyButton";
import { StandardBadge } from "@/components/ui/standard/StandardBadge";
import { StandardEntryCard, StandardEntryList } from "@/components/ui/standard/StandardEntryCard";
import { AddableSection } from "@/components/ui/common/AddableSection";
import { getScopes } from "@/components/ui/api-keys/scopeOptions.server";
import { LuKeyRound } from "react-icons/lu";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const [keys, tasks] = await Promise.all([listApiKeys(), listTasksForPicker()]);
  const scopes = await getScopes();
  const t = await getTranslations("apiKeysPage");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink mb-1">{t("title")}</h1>
        <p className="text-sm text-muted">
          {t.rich("intro", { code: (chunks) => <code className="font-mono text-xs">{chunks}</code> })}
        </p>
      </div>

      <AddableSection
        id="keys"
        title={t("keysTitle")}
        icon={<LuKeyRound />}
        count={keys.length}
        description={t("keysDescription")}
        canAdd
        addLabel={t("createKey")}
        panelTitle={t("newKey")}
        tabs={[{ key: "new", label: t("createNew"), content: <CreateApiKeyForm tasks={tasks} /> }]}
        emptyMessage={t("noKeys")}
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
                  <StandardBadge tone="primary">{key.taskId ? t("oneTask") : t("allTasks")}</StandardBadge>
                  {key.scopes.map((s) => (
                    <StandardBadge key={s}>{scopes.label(s)}</StandardBadge>
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
