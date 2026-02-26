import type { ScheduleType } from "./types.js";
import { DateTime } from "luxon";

function weekdayToJsIndex(weekday: number): number {
  // Plan uses 1-7 as Monday-Sunday; JS uses 0-6 as Sunday-Saturday.
  return weekday % 7;
}

export function getUtcHourMinute(timeHHmm: string, timezone: string): { hour: number; minute: number } {
  const [hour, minute] = timeHHmm.split(":").map(Number);
  const localNow = DateTime.now().setZone(timezone);
  const utc = DateTime.fromObject(
    {
      year: localNow.year,
      month: localNow.month,
      day: localNow.day,
      hour,
      minute
    },
    { zone: timezone }
  ).toUTC();
  return { hour: utc.hour, minute: utc.minute };
}

export function toUtcDailyBucketKey(timeHHmm: string, timezone: string): string {
  const { hour, minute } = getUtcHourMinute(timeHHmm, timezone);
  return `daily_${String(hour).padStart(2, "0")}${String(minute).padStart(2, "0")}_utc`;
}

export function toUtcWeekdayBucketKeys(timeHHmm: string, weekdays: number[], timezone: string): string[] {
  const { hour, minute } = getUtcHourMinute(timeHHmm, timezone);
  return weekdays.map((weekday) => {
    const jsDay = weekdayToJsIndex(weekday);
    return `weekday_${jsDay}_${String(hour).padStart(2, "0")}${String(minute).padStart(2, "0")}_utc`;
  });
}

export function getDueBucketKeysForReminder(
  scheduleType: ScheduleType,
  timeHHmm: string,
  timezone: string,
  weekdays: number[]
): string[] {
  if (scheduleType === "daily") {
    return [toUtcDailyBucketKey(timeHHmm, timezone)];
  }
  return toUtcWeekdayBucketKeys(timeHHmm, weekdays, timezone);
}

export function getCurrentUtcBucketKeys(date = new Date()): string[] {
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const weekday = date.getUTCDay(); // 0-6
  return [`daily_${hh}${mm}_utc`, `weekday_${weekday}_${hh}${mm}_utc`];
}

export function getDispatchLogId(reminderId: string, date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${y}${m}${d}${hh}${mm}_${reminderId}`;
}
