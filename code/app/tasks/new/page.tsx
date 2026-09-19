import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";
import { createTask } from "../actions";
import { TestConnectionButton } from "@/components/ui/TestConnectionButton";
import { DryRunButton } from "@/components/ui/DryRunButton";
import { CronSchedulePicker } from "@/components/ui/CronSchedulePicker";

export default function NewTaskPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-ink mb-1">New backup task</h1>
      <p className="text-sm text-muted mb-6">
        Connection details are encrypted at rest and never shown again after saving.
      </p>

      <form id="task-form" action={createTask} className="space-y-6 bg-white border border-line p-6">
        <div>
          <label className="block text-sm text-ink mb-1" htmlFor="name">
            Task name
          </label>
          <input
            id="name"
            name="name"
            required
            placeholder="Myfin Backup"
            className="w-full border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label className="block text-sm text-ink mb-1" htmlFor="engine">
            Database engine
          </label>
          <select
            id="engine"
            name="engine"
            className="w-full border border-line px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="mysql">MySQL</option>
            <option value="postgres">PostgreSQL</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="host">
              Host
            </label>
            <input id="host" name="host" required className="w-full border border-line px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="port">
              Port
            </label>
            <input
              id="port"
              name="port"
              type="number"
              placeholder="3306 / 5432"
              className="w-full border border-line px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="user">
              User
            </label>
            <input id="user" name="user" required className="w-full border border-line px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full border border-line px-3 py-2 text-sm"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-ink mb-1" htmlFor="database">
              Database name
            </label>
            <input id="database" name="database" required className="w-full border border-line px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input id="ssl" name="ssl" type="checkbox" />
            <label htmlFor="ssl" className="text-sm text-ink">
              Require SSL
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <TestConnectionButton />
          <DryRunButton />
        </div>
        <p className="text-xs text-muted -mt-4">
          Dry run performs a real backup with these settings and immediately discards the result — it takes the
          same time and puts the same load on the database as a real scheduled backup would, but nothing is saved.
        </p>

        <hr className="border-line" />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <CronSchedulePicker
              name="cronExpression"
              defaultValue="0 3 * * *"
            />
          </div>
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="retentionCount">
              Backups to keep
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
            Encrypt backup files
          </label>
        </div>
        <div>
          <label className="block text-sm text-ink mb-1" htmlFor="backupPassword">
            Encryption password
          </label>
          <input
            id="backupPassword"
            name="backupPassword"
            type="password"
            placeholder="Only used if encryption is enabled above"
            className="w-full border border-line px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted mt-1">
            Store this somewhere safe yourself — it is not recoverable from Backup Hub if lost.
          </p>
        </div>
        <StandardSubmitButton title="Create task" />
      </form>
    </div>
  );
}