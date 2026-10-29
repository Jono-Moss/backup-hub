import { NOTIFICATION_CHANNELS, type NotificationChannel } from "@/db/schema";
import { wrapSecret, unwrapSecret } from "@/lib/backup/crypto";
import { sendMail, sendMailStrict } from "../mailer";
import { NOTIFICATION_CHANNEL_DEFINITIONS } from "./definitions";
import type { ChannelConfig, NotificationChannelSender, NotificationMessage } from "./types";
import { ntfySender } from "./ntfy";
import { telegramSender } from "./telegram";
import { discordSender } from "./discord";

export type { NotificationMessage } from "./types";

const emailSender: NotificationChannelSender = {
  async send(config, message) {
    await sendMailStrict(config.email, message.title, message.body);
  },
  describe(config) {
    return config.email;
  },
};

const senders: Record<NotificationChannel, NotificationChannelSender> = {
  email: emailSender,
  ntfy: ntfySender,
  telegram: telegramSender,
  discord: discordSender,
};

/** The columns every channel row (notification_channel, system recipient) has. */
export interface RecipientChannelColumns {
  channel: NotificationChannel;
  email: string | null;
  encryptedConfig: string | null;
}

export function configOf(recipient: RecipientChannelColumns): ChannelConfig {
  if (recipient.channel === "email") return { email: recipient.email ?? "" };
  return recipient.encryptedConfig ? JSON.parse(unwrapSecret(recipient.encryptedConfig)) : {};
}

/** Reads and validates the channel picker's fields from a submitted add-recipient form. */
export function channelConfigFromForm(formData: FormData): { channel: NotificationChannel; config: ChannelConfig } {
  const channel = String(formData.get("channel") || "email") as NotificationChannel;
  if (!NOTIFICATION_CHANNELS.includes(channel)) throw new Error(`Unknown notification channel: ${channel}`);

  const config: ChannelConfig = {};
  for (const field of NOTIFICATION_CHANNEL_DEFINITIONS[channel].fields) {
    const value = String(formData.get(field.name) ?? "").trim();
    if (field.required && !value) throw new Error(`${field.label} is required`);
    if (value) config[field.name] = value;
  }
  if (channel === "email") config.email = config.email.toLowerCase();
  return { channel, config };
}

/** How a channel's config is stored: email in its own column, everything else encrypted. */
export function channelColumns(channel: NotificationChannel, config: ChannelConfig): RecipientChannelColumns {
  return channel === "email"
    ? { channel, email: config.email.toLowerCase(), encryptedConfig: null }
    : { channel, email: null, encryptedConfig: wrapSecret(JSON.stringify(config)) };
}

/** Column values to insert for a new recipient, from a submitted add-recipient form. */
export function recipientColumnsFromForm(formData: FormData): RecipientChannelColumns {
  const { channel, config } = channelConfigFromForm(formData);
  return channelColumns(channel, config);
}

/** Safe-to-display summary, e.g. "Telegram · chat 12345". Never includes secrets. */
export function describeRecipient(recipient: RecipientChannelColumns): string {
  const label = NOTIFICATION_CHANNEL_DEFINITIONS[recipient.channel].label;
  try {
    const detail = senders[recipient.channel].describe(configOf(recipient));
    return recipient.channel === "email" ? detail : `${label} · ${detail}`;
  } catch {
    return label;
  }
}

/**
 * Best-effort delivery for real notifications: never throws, so a broken
 * webhook or missing SMTP config can't break the backup run, login, etc.
 * that triggered it.
 */
export async function deliver(recipient: RecipientChannelColumns, message: NotificationMessage): Promise<void> {
  // Email keeps its existing behaviour: silently skipped when SMTP isn't set up.
  if (recipient.channel === "email") return sendMail(recipient.email ?? "", message.title, message.body);

  try {
    await senders[recipient.channel].send(configOf(recipient), message);
  } catch (err) {
    console.error(`[notify] ${recipient.channel} notification "${message.title}" failed:`, err);
  }
}

/** Used by the "Send test" button — unlike deliver(), errors propagate so the user sees them. */
export async function sendTest(channel: NotificationChannel, config: ChannelConfig): Promise<string | void> {
  return senders[channel].send(config, {
    title: "Backup Hub test notification",
    body: "If you can read this, notifications to this destination are working.",
    level: "info",
  });
}
