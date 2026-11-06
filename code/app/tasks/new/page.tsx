import { EngineSelect } from "@/components/ui/tasks/EngineSelect";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/ui/common/ActionForm";
import { requireUser } from "@/lib/auth/session";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";
import { createTask } from "../actions";
import { TestConnectionButton } from "@/components/ui/tasks/TestConnectionButton";
import { DryRunButton } from "@/components/ui/tasks/DryRunButton";
import { CronSchedulePicker } from "@/components/ui/tasks/CronSchedulePicker";

export default async function NewTaskPage() {
  await requireUser();
  const t = await getTranslations("newTask");
  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-ink mb-1">{t("title")}</h1>
      <p className="text-sm text-muted mb-6">
        {t("subtitle")}
      </p>

      <ActionForm id="task-form" action={createTask} className="space-y-6 bg-white border border-line p-6">
        <div>
          <label className="block text-sm text-ink mb-1" htmlFor="name">
            {t("taskName")}
          </label>
          <input
            id="name"
            name="name"
            required
            placeholder={t("taskNamePlaceholder")}
            className="w-full border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <EngineSelect />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="host">
              {t("host")}
            </label>
            <input id="host" name="host" required className="w-full border border-line px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="port">
              {t("port")}
            </label>
            <input
              id="port"
              name="port"
              type="number"
              placeholder={t("portPlaceholder")}
              className="w-full border border-line px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="user">
              {t("user")}
            </label>
            <input id="user" name="user" required className="w-full border border-line px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="password">
              {t("password")}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full border border-line px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm text-ink mb-1" htmlFor="database">
              {t("database")}
            </label>
            <input id="database" name="database" required className="w-full border border-line px-3 py-2 text-sm" />
          </div>
          <div className="sm:col-span-2 flex items-center gap-2">
            <input id="ssl" name="ssl" type="checkbox" />
            <label htmlFor="ssl" className="text-sm text-ink">
              {t("requireSsl")}
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <TestConnectionButton />
          <DryRunButton />
        </div>
        <p className="text-xs text-muted -mt-4">
          {t("dryRunHint")}
        </p>

        <hr className="border-line" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <CronSchedulePicker
              name="cronExpression"
              defaultValue="0 3 * * *"
            />
          </div>
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="retentionCount">
              {t("backupsToKeep")}
            </label>
            <input
              id="retentionCount"
              name="retentionCount"
              type="number"
              defaultValue={7}
              min={1}
              className="w-full border border-line px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input id="encryptionEnabled" name="encryptionEnabled" type="checkbox" />
          <label htmlFor="encryptionEnabled" className="text-sm text-ink">
            {t("encrypt")}
          </label>
        </div>
        <div>
          <label className="block text-sm text-ink mb-1" htmlFor="backupPassword">
            {t("encryptionPassword")}
          </label>
          <input
            id="backupPassword"
            name="backupPassword"
            type="password"
            placeholder={t("encryptionPlaceholder")}
            className="w-full border border-line px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted mt-1">
            {t("encryptionHint")}
          </p>
        </div>
        <StandardSubmitButton title={t("create")} />
      </ActionForm>
    </div>
  );
}