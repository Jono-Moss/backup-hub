import { errorText, REQUEST_TIMEOUT_MS, type NotificationChannelSender } from "./types";

// https://docs.ntfy.sh/publish/#publish-as-json — JSON rather than the
// header-based API so titles with non-ASCII characters survive.

const PRIORITY = { failure: 5, success: 3, info: 3 } as const;
const TAGS = { failure: ["rotating_light"], success: ["white_check_mark"], info: ["information_source"] } as const;

function serverUrl(config: Record<string, string>): URL {
  const url = new URL((config.serverUrl || "https://ntfy.sh").trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("ntfy server URL must use HTTP or HTTPS.");
  return url;
}

export const ntfySender: NotificationChannelSender = {
  async send(config, message) {
    const topic = config.topic?.trim();
    if (!topic) throw new Error("ntfy topic is required.");

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.accessToken?.trim()) headers.Authorization = `Bearer ${config.accessToken.trim()}`;

    const res = await fetch(serverUrl(config), {
      method: "POST",
      headers,
      body: JSON.stringify({
        topic,
        title: message.title,
        message: message.body,
        priority: PRIORITY[message.level],
        tags: TAGS[message.level],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`ntfy returned HTTP ${res.status}: ${await errorText(res)}`);

    // A 200 alone doesn't prove delivery: a reverse proxy or web page can
    // answer 200 too, and if the server URL includes a path (e.g. the topic)
    // ntfy publishes the raw JSON to *that* topic instead. ntfy replies with
    // the published message, so check it landed where we asked.
    const text = await res.text();
    let published: { event?: string; topic?: string; title?: string } = {};
    try {
      published = JSON.parse(text);
    } catch {}
    if (published.event !== "message") {
      throw new Error(`The server answered, but not like an ntfy server would — check the server URL. Response: ${text.slice(0, 200)}`);
    }
    // Posting the JSON to /<something> instead of the server root makes ntfy
    // treat the whole JSON as plain message text — so no title comes back.
    if (published.topic !== topic || published.title !== message.title) {
      throw new Error(
        `The message wasn't published as expected (it went to topic "${published.topic}" as raw text). The server URL should be just the server, e.g. https://ntfy.example.com, with no topic or path after it — put the topic in the Topic field.`
      );
    }
    const base = serverUrl(config);
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    return `Published to ${new URL(encodeURIComponent(topic), base)}`;
  },

  describe(config) {
    try {
      return `${serverUrl(config).host} / ${config.topic}`;
    } catch {
      return config.topic ?? "";
    }
  },
};
