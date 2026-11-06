import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { getChannelForEdit } from "../actions";
import { EditChannelForm } from "@/components/ui/notifications/EditChannelForm";
import { StandardSection } from "@/components/ui/standard/StandardSection";
import { NOTIFICATION_CHANNEL_DEFINITIONS } from "@/lib/notifications/channels/definitions";

export const dynamic = "force-dynamic";

export default async function EditChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const channel = await getChannelForEdit(id).catch(() => null);
  if (!channel) notFound();

  const t = await getTranslations("channelsPage");
  const tChannels = await getTranslations("channels");
  const typeName = tChannels(`${channel.channel}.label`);
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink mb-1">{t("editTitle", { name: channel.label })}</h1>
        <p className="text-sm text-muted">
          {channel.taskOnly ? t("editIntroTaskOnly", { type: typeName }) : t("editIntroSaved", { type: typeName })}
        </p>
      </div>
      <StandardSection WidthVariant="half">
        <EditChannelForm channel={channel} />
      </StandardSection>
    </div>
  );
}
