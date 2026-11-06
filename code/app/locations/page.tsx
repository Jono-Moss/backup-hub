import { listMyLocations } from "./actions";
import { listDestinationProviders } from "../tasks/actions";
import { AddTaskDestinationForm } from "@/components/ui/locations/AddTaskDestinationForm";
import { DeleteLocationButton, MakeReusableButton, TestLocationButton } from "@/components/ui/locations/LocationActions";
import { StandardSection } from "@/components/ui/standard/StandardSection";
import { StandardLinkButton } from "@/components/ui/standard/StandardLinkButton";
import { StandardSectionHeader } from "@/components/ui/standard/StandardSectionHeader";
import { StandardBadge } from "@/components/ui/standard/StandardBadge";
import { StandardEntryCard, StandardEntryList } from "@/components/ui/standard/StandardEntryCard";
import { AddableSection } from "@/components/ui/common/AddableSection";
import { LuCloudUpload, LuLink } from "react-icons/lu";

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
    <StandardEntryCard
      title={location.label}
      meta={
        <>
          <UsedBy location={location} />
          {location.addedByName && <> · added by {location.addedByName}</>}
        </>
      }
      badges={<StandardBadge tone="primary">{location.typeLabel}</StandardBadge>}
      actions={
        <>
          <TestLocationButton id={location.id} />
          {location.addedByMe && <StandardLinkButton href={`/locations/${location.id}`} title="Edit" compact />}
          {location.taskOnly && location.addedByMe && <MakeReusableButton id={location.id} />}
          <DeleteLocationButton id={location.id} usedByCount={location.usedBy.length} />
        </>
      }
    />
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

      <AddableSection
        id="saved"
        title="Saved locations"
        icon={<LuCloudUpload />}
        count={reusable.length}
        description="Reusable across your tasks."
        canAdd={providers.length > 0}
        addLabel="Add location"
        panelTitle="New save location"
        tabs={[{ key: "new", label: "Create new", content: <AddTaskDestinationForm taskId={null} providers={providers} /> }]}
        emptyMessage="No saved locations yet — add one, or make a task-only location reusable."
      >
        <StandardEntryList>
          {reusable.map((l) => (
            <LocationRow key={l.id} location={l} />
          ))}
        </StandardEntryList>
      </AddableSection>

      <StandardSection id="task-only">
        <StandardSectionHeader
          title="Task-only locations"
          icon={<LuLink />}
          count={taskOnly.length}
          description="Tied to one of your tasks. Locations someone you shared a task with added are listed too: you can remove them, but only they can change their credentials."
        />
        {taskOnly.length === 0 ? (
          <div className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
            No task-only locations.
          </div>
        ) : (
          <StandardEntryList>
            {taskOnly.map((l) => (
              <LocationRow key={l.id} location={l} />
            ))}
          </StandardEntryList>
        )}
      </StandardSection>
    </div>
  );
}
