import { notFound } from "next/navigation";
import { getChannelForEdit } from "../actions";
import { EditChannelForm } from "@/components/ui/EditChannelForm";
import { StandardSection } from "@/components/ui/standard/StandardSection";
import { NOTIFICATION_CHANNEL_DEFINITIONS } from "@/lib/notifications/channels/definitions";

export const dynamic = "force-dynamic";

export default async function EditChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const channel = await getChannelForEdit(id).catch(() => null);
  if (!channel) notFound();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink mb-1">Edit {channel.label}</h1>
        <p className="text-sm text-muted">
          {NOTIFICATION_CHANNEL_DEFINITIONS[channel.channel].label} · {channel.taskOnly ? "task-only" : "saved channel"}.
          Changes apply to every task using it.
        </p>
      </div>
      <StandardSection WidthVariant="half">
        <EditChannelForm channel={channel} />
      </StandardSection>
    </div>
  );
}
