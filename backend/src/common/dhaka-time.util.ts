/**
 * Timezone utilities for Pointfex ERP.
 * Standard Timezone: Asia/Dhaka (UTC+6, strictly DST-free).
 *
 * Week definition: Monday 00:00:00.000 to Sunday 23:59:59.999 Dhaka time.
 * Storage invariant: Timestamps must always be stored in UTC in PostgreSQL.
 */

export const DHAKA_TIMEZONE = 'Asia/Dhaka'
export const DHAKA_OFFSET_HOURS = 6
export const DHAKA_OFFSET_MS = DHAKA_OFFSET_HOURS * 60 * 60 * 1000

export interface DhakaWeekRange {
  year: number
  weekNumber: number
  weekStartUtc: Date // Monday 00:00:00.000 Asia/Dhaka converted to UTC
  weekEndUtc: Date // Sunday 23:59:59.999 Asia/Dhaka converted to UTC
}

export interface DhakaDateTimeComponents {
  year: number
  month: number // 1-12
  day: number // 1-31
  hour: number // 0-23
  minute: number // 0-59
  second: number // 0-59
  millisecond: number // 0-999
  dayOfWeek: number // 1 = Monday, ..., 7 = Sunday (ISO-8601 standard)
}

/**
 * Decomposes a UTC Date into its exact Asia/Dhaka calendar components.
 * Asia/Dhaka is fixed UTC+6 (zero DST).
 */
export function getDhakaComponents(date: Date): DhakaDateTimeComponents {
  // Shift UTC by +6 hours to get Dhaka local time as a UTC representation
  const dhakaShifted = new Date(date.getTime() + DHAKA_OFFSET_MS)

  const year = dhakaShifted.getUTCFullYear()
  const month = dhakaShifted.getUTCMonth() + 1
  const day = dhakaShifted.getUTCDate()
  const hour = dhakaShifted.getUTCHours()
  const minute = dhakaShifted.getUTCMinutes()
  const second = dhakaShifted.getUTCSeconds()
  const millisecond = dhakaShifted.getUTCMilliseconds()

  // getUTCDay(): 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const rawDay = dhakaShifted.getUTCDay()
  const dayOfWeek = rawDay === 0 ? 7 : rawDay

  return { year, month, day, hour, minute, second, millisecond, dayOfWeek }
}

/**
 * Creates a UTC Date representing a specific Asia/Dhaka local wall-clock time.
 */
export function createDhakaDate(
  year: number,
  month: number, // 1-12
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
): Date {
  // Construct as UTC and subtract 6 hours to get the real UTC instant
  const utcMillis = Date.UTC(year, month - 1, day, hour, minute, second, millisecond) - DHAKA_OFFSET_MS
  return new Date(utcMillis)
}

/**
 * Computes the ISO-8601 week number and ISO week-year in Asia/Dhaka.
 * ISO week starts on Monday; Week 1 is the week with the first Thursday of the Gregorian year.
 */
export function getDhakaWeekNumber(date: Date): { year: number; weekNumber: number } {
  const dhaka = new Date(date.getTime() + DHAKA_OFFSET_MS)

  // Target Thursday in current week to determine ISO week year
  const target = new Date(dhaka.getTime())
  const dayNr = (dhaka.getUTCDay() + 6) % 7 // Monday = 0, Sunday = 6
  target.setUTCDate(target.getUTCDate() - dayNr + 3) // Target Thursday

  const isoYear = target.getUTCFullYear()

  // First Thursday of ISO year
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4))
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3)

  // Week number = 1 + round((target - firstThursday) / 7 days)
  const weekNumber = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000))

  return { year: isoYear, weekNumber }
}

/**
 * Computes the exact weekStartUtc (Monday 00:00:00.000 Dhaka) and
 * weekEndUtc (Sunday 23:59:59.999 Dhaka) for:
 * 1) A specific reference Date in UTC, OR
 * 2) An ISO year and week number.
 */
export function getDhakaWeekBoundaries(
  refDateOrYear: Date | number,
  weekNumber?: number,
): DhakaWeekRange {
  if (refDateOrYear instanceof Date) {
    const { year, weekNumber: computedWeek } = getDhakaWeekNumber(refDateOrYear)
    return getDhakaWeekBoundaries(year, computedWeek)
  }

  const year = refDateOrYear
  const week = weekNumber ?? 1

  // Find 4th January in Dhaka
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4DayNr = (jan4.getUTCDay() + 6) % 7 // Monday = 0

  // Monday of Week 1 in Dhaka
  const week1MondayDate = 4 - jan4DayNr
  const mondayDhakaUtcMillis =
    Date.UTC(year, 0, week1MondayDate + (week - 1) * 7, 0, 0, 0, 0) - DHAKA_OFFSET_MS
  const weekStartUtc = new Date(mondayDhakaUtcMillis)

  // Sunday 23:59:59.999 Dhaka is 7 days - 1 ms later
  const sundayDhakaUtcMillis = mondayDhakaUtcMillis + (7 * 24 * 60 * 60 * 1000) - 1
  const weekEndUtc = new Date(sundayDhakaUtcMillis)

  return {
    year,
    weekNumber: week,
    weekStartUtc,
    weekEndUtc,
  }
}

