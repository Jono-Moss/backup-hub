import { errorText, REQUEST_TIMEOUT_MS, type NotificationChannelSender } from "./types";

// https://discord.com/developers/docs/resources/webhook#execute-webhook
// Sent as an embed so success/failure get a coloured side bar.

const COLOR = { failure: 0xdc2626, success: 0x16a34a, info: 0x2563eb } as const;
const DISCORD_HOSTS = new Set(["discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"]);

function webhookUrl(config: Record<string, string>): URL {
  let url: URL;
  try {
    url = new URL((config.webhookUrl || "").trim());
  } catch {
    throw new Error("Discord webhook URL is invalid.");
  }
  // Only ever POST to Discord itself — this URL is user-supplied.
  if (url.protocol !== "https:" || !DISCORD_HOSTS.has(url.hostname) || !url.pathname.startsWith("/api/webhooks/")) {
    throw new Error("Discord webhook URL should look like https://discord.com/api/webhooks/...");
  }
  return url;
}

export const discordSender: NotificationChannelSender = {
  async send(config, message) {
    const res = await fetch(webhookUrl(config), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Backup Hub",
        // Stop error text that happens to contain @everyone etc. from pinging anyone.
        allowed_mentions: { parse: [] },
        embeds: [
          {
            title: message.title.slice(0, 256),
            description: message.body.slice(0, 4096),
            color: COLOR[message.level],
            timestamp: new Date().toISOString(),
          },
        ],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Discord returned HTTP ${res.status}: ${await errorText(res)}`);
  },

  describe() {
    // The webhook URL is the secret, so there's nothing safe to show beyond the type.
    return "webhook";
  },
};
