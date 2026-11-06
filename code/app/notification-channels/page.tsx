import { listMyChannels } from "./actions";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { AddAccountChannelForm } from "@/components/ui/notifications/AddAccountChannelForm";
import { DeleteChannelButton, MakeChannelReusableButton, TestChannelButton } from "@/components/ui/notifications/ChannelActions";
import { StandardSection } from "@/components/ui/standard/StandardSection";
import { StandardLinkButton } from "@/components/ui/standard/StandardLinkButton";
import { StandardSectionHeader } from "@/components/ui/standard/StandardSectionHeader";
import { StandardBadge } from "@/components/ui/standard/StandardBadge";
import { StandardEntryCard, StandardEntryList } from "@/components/ui/standard/StandardEntryCard";
import { AddableSection } from "@/components/ui/common/AddableSection";
import { LuBell, LuLink } from "react-icons/lu";

export const dynamic = "force-dynamic";

type Channel = Awaited<ReturnType<typeof listMyChannels>>[number];

function UsedBy({ channel }: { channel: Channel }) {
  const t = useTranslations("usage");
  if (channel.usedBy.length === 0) return <>{t("notUsed")}</>;
  return (
    <>
      {t("usedBy")}{" "}
      {channel.usedBy.map((t, i) => (
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

function ChannelRow({ channel }: { channel: Channel }) {
  const t = useTranslations("usage");
  const tPage = useTranslations("channelsPage");
  // Push channels' summary already starts with the type ("ntfy · host / topic").
  const target = channel.target.startsWith(channel.channelLabel)
    ? channel.target.slice(channel.channelLabel.length).replace(/^ · /, "")
    : channel.target;
  return (
    <StandardEntryCard
      title={channel.label}
      meta={
        <>
          {target && target !== channel.label && <>{target} · </>}
          <UsedBy channel={channel} />
          {channel.addedByName && <> · {t("addedBy", { name: channel.addedByName })}</>}
        </>
      }
      badges={<StandardBadge tone="primary">{channel.channelLabel}</StandardBadge>}
      actions={
        <>
          <TestChannelButton id={channel.id} />
          {channel.addedByMe && <StandardLinkButton href={`/notification-channels/${channel.id}`} title={tPage("edit")} compact />}
          {channel.taskOnly && channel.addedByMe && <MakeChannelReusableButton id={channel.id} />}
          <DeleteChannelButton id={channel.id} usedByCount={channel.usedBy.length} />
        </>
      }
    />
  );
}

export default async function NotificationChannelsPage() {
  const channels = await listMyChannels();
  const reusable = channels.filter((c) => !c.taskOnly);
  const taskOnly = channels.filter((c) => c.taskOnly);
  const t = await getTranslations("channelsPage");

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
        icon={<LuBell />}
        count={reusable.length}
        description={t("savedDescription")}
        canAdd
        addLabel={t("addChannel")}
        panelTitle={t("newChannel")}
        tabs={[{ key: "new", label: t("createNew"), content: <AddAccountChannelForm /> }]}
        emptyMessage={t("noSaved")}
      >
        <StandardEntryList>
          {reusable.map((c) => (
            <ChannelRow key={c.id} channel={c} />
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
            {taskOnly.map((c) => (
              <ChannelRow key={c.id} channel={c} />
            ))}
          </StandardEntryList>
        )}
      </StandardSection>
    </div>
  );
}
