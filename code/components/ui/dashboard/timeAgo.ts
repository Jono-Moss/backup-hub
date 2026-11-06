import { useFormatter } from "next-intl";

/**
 * "2 hours ago", "vor 2 Stunden", "2小时前" — relative to when the page was
 * rendered, in the viewer's language. Relative times don't depend on the
 * viewer's timezone, so they're safe to render on the server.
 */
export function useTimeAgo() {
  const format = useFormatter();
  const now = new Date();
  return (value: Date | string) => format.relativeTime(new Date(value), now);
}
