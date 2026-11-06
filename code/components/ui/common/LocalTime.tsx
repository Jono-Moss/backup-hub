"use client";

import { useSyncExternalStore } from "react";
import { useLocale } from "next-intl";

interface LocalTimeProps {
  value: string | Date;
  options?: Intl.DateTimeFormatOptions;
}

const DEFAULT_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

// Never changes, so there's nothing to subscribe to: this store only tells
// "hydrating / server render" (false) apart from "running in the browser" (true).
const subscribe = () => () => {};
const inBrowser = () => true;
const onServer = () => false;

// Shows a timestamp in the viewer's own timezone.
//
// The server can't know the viewer's timezone (in Docker it's usually UTC),
// so it renders the time in UTC, and the browser replaces it with local time
// once the page has hydrated.
//
// The UTC text can't be relied on to match exactly between server and browser
// either: Node and the browser ship different versions of the Unicode locale
// data, so the same date, locale and options can still come out differently
// (e.g. zh gives "7:27" in Node but "07:27" in Chrome). So the hydration pass
// tells React to accept the server's text as-is (suppressHydrationWarning,
// which covers this one element's text), and the local-time render uses a
// different key so React builds a fresh element rather than diffing against
// text the browser never produced itself.
export function LocalTime({ value, options = DEFAULT_OPTIONS }: LocalTimeProps) {
  const locale = useLocale();
  const hydrated = useSyncExternalStore(subscribe, inBrowser, onServer);
  const date = new Date(value);
  const iso = date.toISOString();

  if (!hydrated) {
    return (
      <time key="utc" dateTime={iso} suppressHydrationWarning>
        {date.toLocaleString(locale, { ...options, timeZone: "UTC" })}
      </time>
    );
  }
  return (
    <time key="local" dateTime={iso}>
      {date.toLocaleString(locale, options)}
    </time>
  );
}
