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

export const DAYS_OF_WEEK = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

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

export function describeCron(cron: string): string {
  const parsed = parseCron(cron);

  switch (parsed.type) {
    case "minutes":
      return `Every ${parsed.interval} minute${
        parsed.interval === 1 ? "" : "s"
      }`;

    case "hours":
      if (parsed.interval === 1) {
        return `Every hour at ${String(parsed.minute ?? 0).padStart(2, "0")} minutes past the hour`;
      }

      return `Every ${parsed.interval} hours at ${String(
        parsed.minute ?? 0
      ).padStart(2, "0")} minutes past the hour`;

    case "daily":
      return `Every day at ${formatCronTime(
        parsed.hour!,
        parsed.minute!
      )}`;

    case "weekly": {
      const day =
        DAYS_OF_WEEK.find(
          (item) => item.value === parsed.dayOfWeek
        )?.label ?? "selected day";

      return `Every ${day} at ${formatCronTime(
        parsed.hour!,
        parsed.minute!
      )}`;
    }

    case "monthly":
      return `Monthly on day ${
        parsed.dayOfMonth
      } at ${formatCronTime(parsed.hour!, parsed.minute!)}`;

    default:
      return cron || "No schedule";
  }
}