"use client";

import { useEffect, useState } from "react";

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

// Server-rendered markup has no access to the viewer's timezone — a server
// component runs entirely on the machine hosting the app, so formatting a
// date there (even with a pinned locale) always reflects the *server's*
// system timezone, not the person looking at the page. That's the actual
// cause of timestamps looking "N hours off": Docker containers default to
// UTC, so every visitor sees UTC regardless of where they are.
//
// The fix isn't simply "format on the client instead" — a client
// component's first render still has to exactly match what the server
// rendered (that's what hydration is), so if we jumped straight to the
// browser's local timezone, we'd very likely mismatch the server's UTC
// render and trigger the same class of hydration error fixed earlier in
// PasskeyManager. Instead: render the deterministic UTC string on both the
// server and the client's initial hydration pass (guaranteed identical, no
// mismatch), then swap to the browser's real local timezone in a
// useEffect, which runs after hydration completes and is just a normal
// state-driven re-render, not a hydration diff.
export function LocalTime({ value, options = DEFAULT_OPTIONS }: LocalTimeProps) {
  const date = new Date(value);
  const utcString = date.toLocaleString("en-US", { ...options, timeZone: "UTC" });
  const [display, setDisplay] = useState(utcString);

  useEffect(() => {
    setDisplay(date.toLocaleString("en-US", options));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <>{display}</>;
}