import {
  DHAKA_TIMEZONE,
  DHAKA_OFFSET_HOURS,
  getDhakaComponents,
  createDhakaDate,
  getDhakaWeekNumber,
  getDhakaWeekBoundaries,
} from './dhaka-time.util'

describe('DhakaTimezoneUtil - Asia/Dhaka Calendar & Week Engine', () => {
  describe('1. Constants & Offset Integrity', () => {
    it('should be configured for Asia/Dhaka with fixed UTC+6 offset', () => {
      expect(DHAKA_TIMEZONE).toBe('Asia/Dhaka')
      expect(DHAKA_OFFSET_HOURS).toBe(6)
    })
  })

  describe('2. Component Extraction & Date Construction', () => {
    it('should correctly parse 2026-11-19 23:59:59 Dhaka into 2026-11-19T17:59:59.000Z', () => {
      const utcDate = createDhakaDate(2026, 11, 19, 23, 59, 59, 0)
      expect(utcDate.toISOString()).toBe('2026-11-19T17:59:59.000Z')

      const comp = getDhakaComponents(utcDate)
      expect(comp.year).toBe(2026)
      expect(comp.month).toBe(11)
      expect(comp.day).toBe(19)
      expect(comp.hour).toBe(23)
      expect(comp.minute).toBe(59)
      expect(comp.second).toBe(59)
      expect(comp.dayOfWeek).toBe(4) // Thursday
    })

    it('should handle midnight transition: Sunday 18:00 UTC = Monday 00:00 Dhaka', () => {
      const sundayUtc = new Date('2026-11-15T18:00:00.000Z')
      const comp = getDhakaComponents(sundayUtc)

      expect(comp.year).toBe(2026)
      expect(comp.month).toBe(11)
      expect(comp.day).toBe(16) // Monday in Dhaka
      expect(comp.hour).toBe(0)
      expect(comp.minute).toBe(0)
      expect(comp.dayOfWeek).toBe(1) // Monday
    })
  })

  describe('3. Week Boundaries (Monday 00:00:00 to Sunday 23:59:59.999)', () => {
    it('should calculate exact week 47 of 2026 boundaries (Nov 16 - Nov 22, 2026)', () => {
      const refDate = new Date('2026-11-17T12:00:00.000Z') // Tuesday in Dhaka
      const boundaries = getDhakaWeekBoundaries(refDate)

      expect(boundaries.year).toBe(2026)
      expect(boundaries.weekNumber).toBe(47)

      // Monday 16 Nov 2026 00:00:00 Dhaka = Sunday 15 Nov 2026 18:00:00 UTC
      expect(boundaries.weekStartUtc.toISOString()).toBe('2026-11-15T18:00:00.000Z')

      // Sunday 22 Nov 2026 23:59:59.999 Dhaka = Sunday 22 Nov 2026 17:59:59.999 UTC
      expect(boundaries.weekEndUtc.toISOString()).toBe('2026-11-22T17:59:59.999Z')

      // Difference must be exactly 7 days minus 1 millisecond
      const diffMs = boundaries.weekEndUtc.getTime() - boundaries.weekStartUtc.getTime()
      expect(diffMs).toBe(7 * 24 * 60 * 60 * 1000 - 1)
    })

    it('should calculate Sunday 23:59:59.999 boundary correctly and roll to next week on +1 ms', () => {
      // 1 millisecond before boundary closes
      const justBeforeCutoff = new Date('2026-11-22T17:59:59.999Z')
      const weekBefore = getDhakaWeekBoundaries(justBeforeCutoff)
      expect(weekBefore.weekNumber).toBe(47)

      // Exactly at Monday 00:00:00 Dhaka (+1ms)
      const newWeekStart = new Date('2026-11-22T18:00:00.000Z')
      const weekAfter = getDhakaWeekBoundaries(newWeekStart)
      expect(weekAfter.weekNumber).toBe(48)
      expect(weekAfter.weekStartUtc.toISOString()).toBe('2026-11-22T18:00:00.000Z')
    })

    it('should support explicit (year, weekNumber) query matching reference Date query', () => {
      const byWeek = getDhakaWeekBoundaries(2026, 47)
      const byDate = getDhakaWeekBoundaries(new Date('2026-11-17T06:00:00.000Z'))

      expect(byWeek.weekStartUtc.toISOString()).toBe(byDate.weekStartUtc.toISOString())
      expect(byWeek.weekEndUtc.toISOString()).toBe(byDate.weekEndUtc.toISOString())
    })
  })

  describe('4. Zero-DST Verification Across Seasons', () => {
    it('should maintain strict +6 hours offset across summer and winter months', () => {
      // January (Winter)
      const winter = new Date('2026-01-15T06:00:00.000Z')
      expect(getDhakaComponents(winter).hour).toBe(12)

      // July (Summer)
      const summer = new Date('2026-07-15T06:00:00.000Z')
      expect(getDhakaComponents(summer).hour).toBe(12)

      // October / November (DST transition months in Western countries)
      const autumn = new Date('2026-10-25T06:00:00.000Z')
      expect(getDhakaComponents(autumn).hour).toBe(12)
    })
  })

  describe('5. Year Rollover Edge Cases', () => {
    it('should handle year boundary transitions cleanly (Week 1 of 2026)', () => {
      // 1 Jan 2026 is Thursday -> Week 1 of 2026 starts on Monday 29 Dec 2025 in Dhaka
      const week1 = getDhakaWeekBoundaries(2026, 1)
      expect(week1.year).toBe(2026)
      expect(week1.weekNumber).toBe(1)
      // Monday 29 Dec 2025 00:00 Dhaka = Sunday 28 Dec 2025 18:00 UTC
      expect(week1.weekStartUtc.toISOString()).toBe('2025-12-28T18:00:00.000Z')
    })
  })
})

