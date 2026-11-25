/**
 * Mathematical utilities for the Pointfex KPI & XP Engine.
 *
 * Invariants:
 * 1. Deterministic arithmetic without floating point drift.
 * 2. Strict round-half-up to 2 decimal places (`round2`).
 * 3. Bounded values clamped to specified intervals.
 */

/**
 * Standard round-half-up to 2 decimal places.
 * e.g., round2(2.005) -> 2.01, round2(2.004) -> 2.00, round2(-2.005) -> -2.01.
 */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0
  const sign = value < 0 ? -1 : 1
  const abs = Math.abs(value)
  return sign * (Math.floor(abs * 100 + 0.5 + 1e-12) / 100)
}

/**
 * Clamps a number within [min, max].
 */
export function clamp(value: number, min = 0, max = 100): number {
  if (Number.isNaN(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

/**
 * Checks if a set of numeric weights sums to 1.0 within epsilon (1e-6).
 */
export function validateWeightsSum(weights: number[], expectedSum = 1.0, epsilon = 1e-6): boolean {
  const sum = weights.reduce((acc, curr) => acc + curr, 0)
  return Math.abs(sum - expectedSum) <= epsilon
}

