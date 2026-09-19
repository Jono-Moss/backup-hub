"use client";

import { useState } from "react";
import {
  describeCron,
  DAYS_OF_WEEK,
  parseCron,
  ScheduleType,
} from "@/lib/cron/cronUtils";

type SchedulePickerProps = {
  name?: string;
  defaultValue?: string;
};

export function CronSchedulePicker({
  name = "cronExpression",
  defaultValue = "0 3 * * *",
}: SchedulePickerProps) {
  const initial = parseCron(defaultValue);

  const [open, setOpen] = useState(false);
  const [cronExpression, setCronExpression] = useState(defaultValue);

  const [type, setType] = useState<ScheduleType>(initial.type);
  const [interval, setInterval] = useState(initial.interval ?? 15);
  const [hour, setHour] = useState(initial.hour ?? 3);
  const [minute, setMinute] = useState(initial.minute ?? 0);
  const [dayOfWeek, setDayOfWeek] = useState(initial.dayOfWeek ?? "1");
  const [dayOfMonth, setDayOfMonth] = useState(initial.dayOfMonth ?? 1);
  const [customCron, setCustomCron] = useState(defaultValue);

  function generateCron(): string {
    switch (type) {
      case "minutes":
        return `*/${interval} * * * *`;

      case "hours":
        return `${minute} */${interval} * * *`;

      case "daily":
        return `${minute} ${hour} * * *`;

      case "weekly":
        return `${minute} ${hour} * * ${dayOfWeek}`;

      case "monthly":
        return `${minute} ${hour} ${dayOfMonth} * *`;

      case "custom":
        return customCron.trim();

      default:
        return "0 3 * * *";
    }
  }

  function applySchedule() {
    const cron = generateCron();

    setCronExpression(cron);
    setOpen(false);
  }

  function handleTypeChange(value: ScheduleType) {
    setType(value);
  }

  const description = describeCron(cronExpression);

  return (
    <>
      <input type="hidden" name={name} value={cronExpression} />

      <div>
        <label className="block text-sm text-ink mb-1">
          Schedule
        </label>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full border border-line bg-white px-3 py-2 text-left hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <div className="text-sm text-ink">
            {description}
          </div>

          <div className="text-xs text-muted mt-1 font-mono">
            {cronExpression}
          </div>
        </button>

        <p className="text-xs text-muted mt-1">
          Backups run according to the server&apos;s local time.
        </p>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close schedule dialog"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="schedule-title"
            className="relative z-10 w-full max-w-lg bg-white border border-line shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h2
                  id="schedule-title"
                  className="text-lg font-semibold text-ink"
                >
                  Backup schedule
                </h2>

                <p className="text-sm text-muted mt-1">
                  Choose when backups should run.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted hover:text-ink text-xl leading-none"
                aria-label="Close"
              >
                x
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div>
                <label
                  htmlFor="schedule-type"
                  className="block text-sm text-ink mb-1"
                >
                  Run
                </label>

                <select
                  id="schedule-type"
                  value={type}
                  onChange={(e) =>
                    handleTypeChange(
                      e.target.value as ScheduleType
                    )
                  }
                  className="w-full border border-line bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="minutes">
                    Every few minutes
                  </option>

                  <option value="hours">
                    Every few hours
                  </option>

                  <option value="daily">
                    Every day
                  </option>

                  <option value="weekly">
                    Every week
                  </option>

                  <option value="monthly">
                    Every month
                  </option>

                  <option value="custom">
                    Custom cron expression
                  </option>
                </select>
              </div>

              {type === "minutes" && (
                <div>
                  <label
                    htmlFor="schedule-minutes"
                    className="block text-sm text-ink mb-1"
                  >
                    Every
                  </label>

                  <div className="flex items-center gap-2">
                    <input
                      id="schedule-minutes"
                      type="number"
                      min={1}
                      max={59}
                      value={interval}
                      onChange={(e) =>
                        setInterval(
                          Math.max(
                            1,
                            Number(e.target.value)
                          )
                        )
                      }
                      className="w-24 border border-line px-3 py-2 text-sm"
                    />

                    <span className="text-sm text-ink">
                      minute{interval === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              )}

              {type === "hours" && (
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="schedule-hours"
                      className="block text-sm text-ink mb-1"
                    >
                      Every
                    </label>

                    <div className="flex items-center gap-2">
                      <input
                        id="schedule-hours"
                        type="number"
                        min={1}
                        max={23}
                        value={interval}
                        onChange={(e) =>
                          setInterval(
                            Math.max(
                              1,
                              Number(e.target.value)
                            )
                          )
                        }
                        className="w-24 border border-line px-3 py-2 text-sm"
                      />

                      <span className="text-sm text-ink">
                        hour{interval === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="schedule-hour-minute"
                      className="block text-sm text-ink mb-1"
                    >
                      At minute
                    </label>

                    <input
                      id="schedule-hour-minute"
                      type="number"
                      min={0}
                      max={59}
                      value={minute}
                      onChange={(e) =>
                        setMinute(
                          Math.min(
                            59,
                            Math.max(
                              0,
                              Number(e.target.value)
                            )
                          )
                        )
                      }
                      className="w-24 border border-line px-3 py-2 text-sm"
                    />

                    <p className="text-xs text-muted mt-1">
                      For example, 15 means 15 minutes past
                      the hour.
                    </p>
                  </div>
                </div>
              )}

              {(type === "daily" ||
                type === "weekly" ||
                type === "monthly") && (
                <div className="space-y-4">
                  {type === "weekly" && (
                    <div>
                      <label
                        htmlFor="schedule-day"
                        className="block text-sm text-ink mb-1"
                      >
                        Day of the week
                      </label>

                      <select
                        id="schedule-day"
                        value={dayOfWeek}
                        onChange={(e) =>
                          setDayOfWeek(e.target.value)
                        }
                        className="w-full border border-line bg-white px-3 py-2 text-sm"
                      >
                        {DAYS_OF_WEEK.map((day) => (
                          <option
                            key={day.value}
                            value={day.value}
                          >
                            {day.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {type === "monthly" && (
                    <div>
                      <label
                        htmlFor="schedule-day-of-month"
                        className="block text-sm text-ink mb-1"
                      >
                        Day of the month
                      </label>

                      <select
                        id="schedule-day-of-month"
                        value={dayOfMonth}
                        onChange={(e) =>
                          setDayOfMonth(
                            Number(e.target.value)
                          )
                        }
                        className="w-full border border-line bg-white px-3 py-2 text-sm"
                      >
                        {Array.from(
                          { length: 28 },
                          (_, index) => index + 1
                        ).map((day) => (
                          <option key={day} value={day}>
                            {day}
                          </option>
                        ))}
                      </select>

                      <p className="text-xs text-muted mt-1">
                        Days 1–28 are available so the schedule
                        works in every month.
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm text-ink mb-1">
                      Time
                    </label>

                    <div className="flex items-center gap-2">
                      <select
                        value={hour}
                        onChange={(e) =>
                          setHour(Number(e.target.value))
                        }
                        className="border border-line bg-white px-3 py-2 text-sm"
                      >
                        {Array.from(
                          { length: 24 },
                          (_, value) => value
                        ).map((value) => (
                          <option
                            key={value}
                            value={value}
                          >
                            {String(value).padStart(2, "0")}
                          </option>
                        ))}
                      </select>

                      <span className="text-ink">:</span>

                      <select
                        value={minute}
                        onChange={(e) =>
                          setMinute(Number(e.target.value))
                        }
                        className="border border-line bg-white px-3 py-2 text-sm"
                      >
                        {Array.from(
                          { length: 60 },
                          (_, value) => value
                        ).map((value) => (
                          <option
                            key={value}
                            value={value}
                          >
                            {String(value).padStart(2, "0")}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {type === "custom" && (
                <div>
                  <label
                    htmlFor="custom-cron"
                    className="block text-sm text-ink mb-1"
                  >
                    Cron expression
                  </label>

                  <input
                    id="custom-cron"
                    value={customCron}
                    onChange={(e) =>
                      setCustomCron(e.target.value)
                    }
                    placeholder="0 3 * * *"
                    className="w-full border border-line px-3 py-2 text-sm font-mono"
                  />

                  <p className="text-xs text-muted mt-1">
                    Advanced users can enter a standard 5-part
                    cron expression.
                  </p>
                </div>
              )}

              <div className="border border-line bg-gray-50 px-4 py-3">
                <div className="text-xs text-muted mb-1">
                  Schedule preview
                </div>

                <div className="text-sm font-medium text-ink">
                  {describeCron(generateCron())}
                </div>

                <div className="text-xs font-mono text-muted mt-1">
                  {generateCron()}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="border border-line px-4 py-2 text-sm text-ink hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={applySchedule}
                className="bg-primary text-white px-4 py-2 text-sm hover:opacity-90"
              >
                Apply schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}