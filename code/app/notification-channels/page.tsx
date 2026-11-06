import { listMyChannels } from "./actions";
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
  if (channel.usedBy.length === 0) return <>not used by any task</>;
  return (
    <>
      used by{" "}
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
          {channel.addedByName && <> · added by {channel.addedByName}</>}
        </>
      }
      badges={<StandardBadge tone="primary">{channel.channelLabel}</StandardBadge>}
      actions={
        <>
          <TestChannelButton id={channel.id} />
          {channel.addedByMe && <StandardLinkButton href={`/notification-channels/${channel.id}`} title="Edit" compact />}
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink mb-1">Notifications</h1>
        <p className="text-sm text-muted">
          Your notification channels: where your tasks send backup success/failure alerts — email, ntfy, Telegram or
          Discord. Saved
          channels can be used by any of your tasks: set them up once, pick them from a task&apos;s page, and changing
          them here updates every task that uses them. Task-only channels belong to a single task. Nobody else, admins
          included, can see these.
        </p>
      </div>

      <AddableSection
        id="saved"
        title="Saved channels"
        icon={<LuBell />}
        count={reusable.length}
        description="Reusable across your tasks."
        canAdd
        addLabel="Add channel"
        panelTitle="New notification channel"
        tabs={[{ key: "new", label: "Create new", content: <AddAccountChannelForm /> }]}
        emptyMessage="No saved channels yet — add one, or make a task-only channel reusable."
      >
        <StandardEntryList>
          {reusable.map((c) => (
            <ChannelRow key={c.id} channel={c} />
          ))}
        </StandardEntryList>
      </AddableSection>

      <StandardSection id="task-only">
        <StandardSectionHeader
          title="Task-only channels"
          icon={<LuLink />}
          count={taskOnly.length}
          description="Tied to one of your tasks. Channels someone you shared a task with added are listed too: you can remove them, but only they can change their settings."
        />
        {taskOnly.length === 0 ? (
          <div className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
            No task-only channels.
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
