import { listMyLocations } from "./actions";
import { listDestinationProviders } from "../tasks/actions";
import { AddTaskDestinationForm } from "@/components/ui/AddTaskDestinationForm";
import { DeleteLocationButton, MakeReusableButton, TestLocationButton } from "@/components/ui/LocationActions";
import { StandardSection } from "@/components/ui/standard/StandardSection";
import { StandardLinkButton } from "@/components/ui/standard/StandardLinkButton";

export const dynamic = "force-dynamic";

type Location = Awaited<ReturnType<typeof listMyLocations>>[number];

function UsedBy({ location }: { location: Location }) {
  if (location.usedBy.length === 0) return <>not used by any task</>;
  return (
    <>
      used by{" "}
      {location.usedBy.map((t, i) => (
        <span key={t.id}>
          {i > 0 && ", "}
          <a href={`/tasks/${t.id}`} className="text-primary hover:underline">
            {t.name}
          </a>
        </span>
      ))}
    </>
  );
}

function LocationRow({ location }: { location: Location }) {
  return (
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between py-3">
      <div className="min-w-0">
        <p className="text-sm text-ink truncate">{location.label}</p>
        <p className="text-xs text-muted">
          {location.typeLabel} · <UsedBy location={location} />
          {location.addedByName && <> · added by {location.addedByName}</>}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
        <TestLocationButton id={location.id} />
        {location.addedByMe && <StandardLinkButton href={`/locations/${location.id}`} title="Edit" compact />}
        {location.taskOnly && location.addedByMe && <MakeReusableButton id={location.id} />}
        <DeleteLocationButton id={location.id} usedByCount={location.usedBy.length} />
      </div>
    </div>
  );
}

export default async function SaveLocationsPage() {
  const [locations, providers] = await Promise.all([listMyLocations(), listDestinationProviders()]);
  const reusable = locations.filter((l) => !l.taskOnly);
  const taskOnly = locations.filter((l) => l.taskOnly);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink mb-1">Save locations</h1>
        <p className="text-sm text-muted">
          Off-site places your backups get copied to. Saved locations can be used by any of your tasks — enter the
          credentials once, pick them from a task&apos;s page, and changing them here updates every task that uses
          them. Task-only locations belong to a single task and can&apos;t be used anywhere else. Nobody else, admins
          included, can see these.
        </p>
      </div>

      <StandardSection>
        <h2 className="text-sm font-semibold text-ink mb-1">Saved locations</h2>
        <p className="text-sm text-muted mb-2">Reusable across your tasks.</p>
        {reusable.length === 0 ? (
          <p className="text-sm text-muted py-3">None yet — add one below, or make a task-only location reusable.</p>
        ) : (
          <div className="divide-y divide-line">
            {reusable.map((l) => (
              <LocationRow key={l.id} location={l} />
            ))}
          </div>
        )}
      </StandardSection>

      <StandardSection>
        <h2 className="text-sm font-semibold text-ink mb-1">Task-only locations</h2>
        <p className="text-sm text-muted mb-2">
          Tied to one of your tasks. Locations someone you shared a task with added are listed too: you can remove
          them, but only they can change their credentials.
        </p>
        {taskOnly.length === 0 ? (
          <p className="text-sm text-muted py-3">None.</p>
        ) : (
          <div className="divide-y divide-line">
            {taskOnly.map((l) => (
              <LocationRow key={l.id} location={l} />
            ))}
          </div>
        )}
      </StandardSection>

      <StandardSection>
        <AddTaskDestinationForm taskId={null} providers={providers} />
      </StandardSection>
    </div>
  );
}
