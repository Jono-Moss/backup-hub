import { errorText, REQUEST_TIMEOUT_MS, type NotificationChannelSender } from "./types";

// https://core.telegram.org/bots/api#sendmessage — plain text, no
// parse_mode, so backup error messages full of underscores/brackets can't
// break Markdown/HTML parsing.

const MAX_LENGTH = 4096;
const ICON = { failure: "❌", success: "✅", info: "ℹ️" } as const;

export const telegramSender: NotificationChannelSender = {
  async send(config, message) {
    const token = config.botToken?.trim();
    const chatId = config.chatId?.trim();
    if (!token || !chatId) throw new Error("Telegram bot token and chat ID are required.");
    // The token is part of the URL path — validate it so it can't be used
    // to point the request somewhere else.
    if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) throw new Error("That doesn't look like a Telegram bot token.");

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `${ICON[message.level]} ${message.title}\n\n${message.body}`.slice(0, MAX_LENGTH),
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      // Telegram's error JSON is {"ok":false,"description":"..."} — and
      // never echoes the token, so it's safe to surface.
      const text = await errorText(res);
      let description = text;
      try {
        description = JSON.parse(text).description ?? text;
      } catch {}
      throw new Error(`Telegram returned HTTP ${res.status}: ${description}`);
    }
  },

  describe(config) {
    return `chat ${config.chatId}`;
  },
};
