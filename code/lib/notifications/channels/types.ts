export type NotificationLevel = "success" | "failure" | "info";

export interface NotificationMessage {
  title: string;
  body: string;
  /** Lets push channels pick a priority / colour / icon. */
  level: NotificationLevel;
}

export type ChannelConfig = Record<string, string>;

export interface NotificationChannelSender {
  /**
   * Throws on failure — callers decide whether that's fatal (test button) or
   * just logged (real notifications). May return a short note on where the
   * message went, shown after a successful test.
   */
  send(config: ChannelConfig, message: NotificationMessage): Promise<string | void>;
  /** Non-secret one-line summary shown in the recipient list. Must never include tokens or webhook URLs. */
  describe(config: ChannelConfig): string;
}

export const REQUEST_TIMEOUT_MS = 15_000;

/** Response body for error messages, trimmed so a misbehaving server can't flood the logs/UI. */
export async function errorText(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  return text.slice(0, 300);
}
