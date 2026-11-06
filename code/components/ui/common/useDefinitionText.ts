import { useTranslations } from "next-intl";

// Labels and help text that come from code definitions (notification channel
// types in lib/notifications/channels/definitions.ts, save-location providers'
// configFields in lib/backup/destinations/). The English text stays in those
// definitions — the server uses them too — and translations/<locale>.json can
// translate any of it under "channels" / "destinations":
//   channels.<type>.label
//   channels.<type>.fields.<field>.label | helpText | placeholder
// Anything without a translation falls back to the definition's own text,
// so a new provider or field shows up in English until it's translated.
export function useDefinitionText(namespace: "channels" | "destinations") {
  const t = useTranslations(namespace) as unknown as {
    (key: string): string;
    has(key: string): boolean;
  };
  return (path: string, fallback: string | undefined) => (t.has(path) ? t(path) : fallback);
}
