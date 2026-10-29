import { listMyChannels } from "./actions";
import { AddAccountChannelForm } from "@/components/ui/AddAccountChannelForm";
import { DeleteChannelButton, MakeChannelReusableButton, TestChannelButton } from "@/components/ui/ChannelActions";
import { StandardSection } from "@/components/ui/standard/StandardSection";
import { StandardLinkButton } from "@/components/ui/standard/StandardLinkButton";

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
  return (
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between py-3">
      <div className="min-w-0">
        <p className="text-sm text-ink truncate">{channel.label}</p>
        <p className="text-xs text-muted">
          {/* Push channels' summary already starts with the type ("ntfy · host / topic"). */}
          {channel.target.startsWith(channel.channelLabel) ? channel.target : channel.channelLabel}
          {!channel.target.startsWith(channel.channelLabel) && channel.target !== channel.label && <> · {channel.target}</>}
          {" · "}
          <UsedBy channel={channel} />
          {channel.addedByName && <> · added by {channel.addedByName}</>}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
        <TestChannelButton id={channel.id} />
        {channel.addedByMe && <StandardLinkButton href={`/notification-channels/${channel.id}`} title="Edit" compact />}
        {channel.taskOnly && channel.addedByMe && <MakeChannelReusableButton id={channel.id} />}
        <DeleteChannelButton id={channel.id} usedByCount={channel.usedBy.length} />
      </div>
    </div>
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

      <StandardSection>
        <h2 className="text-sm font-semibold text-ink mb-1">Saved channels</h2>
        <p className="text-sm text-muted mb-2">Reusable across your tasks.</p>
        {reusable.length === 0 ? (
          <p className="text-sm text-muted py-3">None yet — add one below, or make a task-only channel reusable.</p>
        ) : (
          <div className="divide-y divide-line">
            {reusable.map((c) => (
              <ChannelRow key={c.id} channel={c} />
            ))}
          </div>
        )}
      </StandardSection>

      <StandardSection>
        <h2 className="text-sm font-semibold text-ink mb-1">Task-only channels</h2>
        <p className="text-sm text-muted mb-2">
          Tied to one of your tasks. Channels someone you shared a task with added are listed too: you can remove
          them, but only they can change their settings.
        </p>
        {taskOnly.length === 0 ? (
          <p className="text-sm text-muted py-3">None.</p>
        ) : (
          <div className="divide-y divide-line">
            {taskOnly.map((c) => (
              <ChannelRow key={c.id} channel={c} />
            ))}
          </div>
        )}
      </StandardSection>

      <StandardSection>
        <AddAccountChannelForm />
      </StandardSection>
    </div>
  );
}
