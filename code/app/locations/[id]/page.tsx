import { notFound } from "next/navigation";
import { getLocationForEdit } from "../actions";
import { listDestinationProviders } from "../../tasks/actions";
import { EditLocationForm } from "@/components/ui/EditLocationForm";
import { StandardSection } from "@/components/ui/standard/StandardSection";

export const dynamic = "force-dynamic";

export default async function EditLocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const location = await getLocationForEdit(id).catch(() => null);
  if (!location) notFound();
  const provider = (await listDestinationProviders()).find((p) => p.type === location.type);
  if (!provider) notFound();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink mb-1">Edit {location.label}</h1>
        <p className="text-sm text-muted">
          {provider.label} · {location.taskOnly ? "task-only" : "saved location"}. Changes apply to every task using
          it from the next backup on.
        </p>
      </div>
      <StandardSection WidthVariant="half">
        <EditLocationForm location={location} provider={provider} />
      </StandardSection>
    </div>
  );
}
