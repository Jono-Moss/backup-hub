export type ScheduleType =
  | "minutes"
  | "hours"
  | "daily"
  | "weekly"
  | "monthly"
  | "custom";

export type ParsedSchedule = {
  type: ScheduleType;
  interval?: number;
  hour?: number;
  minute?: number;
  dayOfWeek?: string;
  dayOfMonth?: number;
};

/** Weekdays for cron's day-of-week field (0 = Sunday), named in `locale`. */
export function daysOfWeek(locale: string): { value: string; label: string }[] {
  const format = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
  // 1 January 2023 was a Sunday.
  return Array.from({ length: 7 }, (_, i) => ({ value: String(i), label: format.format(new Date(Date.UTC(2023, 0, 1 + i))) }));
}

/** The "schedule" messages describeCron needs (pass useTranslations("schedule") / getTranslations("schedule")). */
export type ScheduleTranslator = (
  key: "everyMinutes" | "everyHourAt" | "everyHoursAt" | "everyDayAt" | "everyWeekdayAt" | "monthlyAt" | "noSchedule" | "selectedDay",
  values?: Record<string, string | number>
) => string;

export function parseCron(cron: string): ParsedSchedule {
  const parts = cron.trim().split(/\s+/);

  if (parts.length !== 5) {
    return { type: "custom" };
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // */N * * * *
  if (
    minute.startsWith("*/") &&
    hour === "*" &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    const interval = Number(minute.substring(2));

    if (Number.isInteger(interval) && interval > 0) {
      return {
        type: "minutes",
        interval,
      };
    }
  }

  // M */N * * *
  if (
    /^\d+$/.test(minute) &&
    hour.startsWith("*/") &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    const interval = Number(hour.substring(2));

    if (Number.isInteger(interval) && interval > 0) {
      return {
        type: "hours",
        interval,
        minute: Number(minute),
      };
    }
  }

  // M H * * *
  if (
    /^\d+$/.test(minute) &&
    /^\d+$/.test(hour) &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return {
      type: "daily",
      minute: Number(minute),
      hour: Number(hour),
    };
  }

  // M H * * D
  if (
    /^\d+$/.test(minute) &&
    /^\d+$/.test(hour) &&
    dayOfMonth === "*" &&
    month === "*" &&
    /^\d+$/.test(dayOfWeek)
  ) {
    return {
      type: "weekly",
      minute: Number(minute),
      hour: Number(hour),
      dayOfWeek,
    };
  }

  // M H D * *
  if (
    /^\d+$/.test(minute) &&
    /^\d+$/.test(hour) &&
    /^\d+$/.test(dayOfMonth) &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return {
      type: "monthly",
      minute: Number(minute),
      hour: Number(hour),
      dayOfMonth: Number(dayOfMonth),
    };
  }

  return { type: "custom" };
}

export function formatCronTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function describeCron(cron: string, t: ScheduleTranslator, locale: string): string {
  const parsed = parseCron(cron);
  const minute = String(parsed.minute ?? 0).padStart(2, "0");

  switch (parsed.type) {
    case "minutes":
      return t("everyMinutes", { count: parsed.interval! });
    case "hours":
      return parsed.interval === 1
        ? t("everyHourAt", { minute })
        : t("everyHoursAt", { count: parsed.interval!, minute });
    case "daily":
      return t("everyDayAt", { time: formatCronTime(parsed.hour!, parsed.minute!) });
    case "weekly": {
      const day = daysOfWeek(locale).find((d) => d.value === parsed.dayOfWeek)?.label ?? t("selectedDay");
      return t("everyWeekdayAt", { day, time: formatCronTime(parsed.hour!, parsed.minute!) });
    }
    case "monthly":
      return t("monthlyAt", { day: parsed.dayOfMonth!, time: formatCronTime(parsed.hour!, parsed.minute!) });
    default:
      return cron || t("noSchedule");
  }
}
