import { listMyLocations } from "./actions";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("usage");
  if (location.usedBy.length === 0) return <>{t("notUsed")}</>;
  return (
    <>
      {t("usedBy")}{" "}
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
  const t = useTranslations("usage");
  const tPage = useTranslations("locationsPage");
  return (
    <StandardEntryCard
      title={location.label}
      meta={
        <>
          <UsedBy location={location} />
          {location.addedByName && <> · {t("addedBy", { name: location.addedByName })}</>}
        </>
      }
      badges={<StandardBadge tone="primary">{location.typeLabel}</StandardBadge>}
      actions={
        <>
          <TestLocationButton id={location.id} />
          {location.addedByMe && <StandardLinkButton href={`/locations/${location.id}`} title={tPage("edit")} compact />}
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
  const t = await getTranslations("locationsPage");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink mb-1">{t("title")}</h1>
        <p className="text-sm text-muted">
          {t("intro")}
        </p>
      </div>

      <AddableSection
        id="saved"
        title={t("savedTitle")}
        icon={<LuCloudUpload />}
        count={reusable.length}
        description={t("savedDescription")}
        canAdd={providers.length > 0}
        addLabel={t("addLocation")}
        panelTitle={t("newLocation")}
        tabs={[{ key: "new", label: t("createNew"), content: <AddTaskDestinationForm taskId={null} providers={providers} /> }]}
        emptyMessage={t("noSaved")}
      >
        <StandardEntryList>
          {reusable.map((l) => (
            <LocationRow key={l.id} location={l} />
          ))}
        </StandardEntryList>
      </AddableSection>

      <StandardSection id="task-only">
        <StandardSectionHeader
          title={t("taskOnlyTitle")}
          icon={<LuLink />}
          count={taskOnly.length}
          description={t("taskOnlyDescription")}
        />
        {taskOnly.length === 0 ? (
          <div className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
            {t("noTaskOnly")}
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
