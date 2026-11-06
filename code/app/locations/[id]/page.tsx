import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { getLocationForEdit } from "../actions";
import { listDestinationProviders } from "../../tasks/actions";
import { EditLocationForm } from "@/components/ui/locations/EditLocationForm";
import { StandardSection } from "@/components/ui/standard/StandardSection";

export const dynamic = "force-dynamic";

export default async function EditLocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const location = await getLocationForEdit(id).catch(() => null);
  if (!location) notFound();
  const provider = (await listDestinationProviders()).find((p) => p.type === location.type);
  if (!provider) notFound();
  const t = await getTranslations("locationsPage");
  const tDest = await getTranslations("destinations");
  const providerName = tDest.has(`${provider.type}.label` as never) ? tDest(`${provider.type}.label` as never) : provider.label;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink mb-1">{t("editTitle", { name: location.label })}</h1>
        <p className="text-sm text-muted">
          {location.taskOnly ? t("editIntroTaskOnly", { provider: providerName }) : t("editIntroSaved", { provider: providerName })}
        </p>
      </div>
      <StandardSection WidthVariant="half">
        <EditLocationForm location={location} provider={provider} />
      </StandardSection>
    </div>
  );
}
