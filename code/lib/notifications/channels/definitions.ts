import type { NotificationChannel } from "@/db/schema";

// What each notification channel needs from the user. Kept separate from the
// senders (./index.ts) because it's imported by the client-side add-recipient
// forms, which generate their inputs from these fields — same idea as a
// backup destination's configFields.
//
// To add a channel: add it to NOTIFICATION_CHANNELS in db/schema.ts (plus a
// migration), describe its fields here, and implement a sender in this folder.

export interface NotificationChannelField {
  /** Form field name, and the key the value is stored under in the encrypted config. */
  name: string;
  label: string;
  type: "text" | "password" | "email" | "url";
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  helpText?: string;
}

export interface NotificationChannelDefinition {
  type: NotificationChannel;
  label: string;
  fields: NotificationChannelField[];
}

export const NOTIFICATION_CHANNEL_DEFINITIONS: Record<NotificationChannel, NotificationChannelDefinition> = {
  email: {
    type: "email",
    label: "Email",
    fields: [{ name: "email", label: "Email", type: "email", required: true, helpText: "Requires SMTP to be configured on the server (see .env)." }],
  },
  ntfy: {
    type: "ntfy",
    label: "ntfy",
    fields: [
      { name: "serverUrl", label: "Server URL", type: "url", required: true, defaultValue: "https://ntfy.sh", helpText: "Use https://ntfy.sh or your own ntfy server." },
      {
        name: "topic",
        label: "Topic",
        type: "text",
        required: true,
        placeholder: "backup-hub-x7k2p9",
        helpText: "On the public ntfy.sh server anyone who knows the topic name can read it, so pick something hard to guess.",
      },
      {
        name: "accessToken",
        label: "Access token (optional)",
        type: "password",
        placeholder: "tk_...",
        helpText: "Only needed for topics that require login.",
      },
    ],
  },
  telegram: {
    type: "telegram",
    label: "Telegram",
    fields: [
      { name: "botToken", label: "Bot token", type: "password", required: true, placeholder: "123456789:AA...", helpText: "Create a bot by messaging @BotFather on Telegram." },
      {
        name: "chatId",
        label: "Chat ID",
        type: "text",
        required: true,
        placeholder: "123456789 or -100123456789",
        helpText: "Send your bot a message (or add it to a group) first — bots can't start a conversation themselves.",
      },
    ],
  },
  discord: {
    type: "discord",
    label: "Discord",
    fields: [
      {
        name: "webhookUrl",
        label: "Webhook URL",
        type: "password",
        required: true,
        placeholder: "https://discord.com/api/webhooks/...",
        helpText: "Channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.",
      },
    ],
  },
};
