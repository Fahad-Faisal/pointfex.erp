import { round2, clamp, validateWeightsSum } from './math.util'
import {
  DeveloperTaskScoringInput,
  DeveloperTaskScoringResult,
  DeveloperWeeklyKpiInput,
  WeeklyKpiResult,
  PmWeeklyKpiInput,
  CLevelWeeklyKpiInput,
  CeoWeeklyKpiInput,
  DisciplinaryDeductionInput,
  DisciplinaryDeductionResult,
} from './types'

/**
 * Level 1: Developer Task KPI Evaluation
 *
 * Formula: TaskScore = 0.50*PM + 0.15*CTO + 0.15*CPO + 0.10*CFO + 0.10*CHRO
 * Default executive scores: matched to the PM score ("full marks relative to PM satisfaction").
 * Provisional flag: true if any executive score is UNREAD or defaulted.
 * Inactivity penalty: Multiplicative reduction (score * (1 - penaltyRate)) applied to next evaluated task.
 */
export function taskScoreDeveloper(input: DeveloperTaskScoringInput): DeveloperTaskScoringResult {
  const pmScore = input.pm?.score
  if (pmScore === undefined || pmScore === null || pmScore < 0 || pmScore > 100) {
    throw new Error(`Invalid PM satisfaction score: ${pmScore}. Must be between 0 and 100.`)
  }

  const wPm = input.weights?.pm ?? 0.50
  const wCto = input.weights?.cto ?? 0.15
  const wCpo = input.weights?.cpo ?? 0.15
  const wCfo = input.weights?.cfo ?? 0.10
  const wChro = input.weights?.chro ?? 0.10

  if (!validateWeightsSum([wPm, wCto, wCpo, wCfo, wChro])) {
    throw new Error(
      `Task evaluation weights must sum to 1.0. Given: ${[wPm, wCto, wCpo, wCfo, wChro].join(', ')}`,
    )
  }

  const validateScore = (score: number | undefined, roleName: string): number => {
    if (score !== undefined) {
      if (score < 0 || score > 100 || !Number.isFinite(score)) {
        throw new Error(`Invalid ${roleName} score: ${score}. Must be between 0 and 100.`)
      }
      return score
    }
    return pmScore // Default to PM score
  }

  const ctoScore = validateScore(input.cto?.score, 'CTO')
  const cpoScore = validateScore(input.cpo?.score, 'CPO')
  const cfoScore = validateScore(input.cfo?.score, 'CFO')
  const chroScore = validateScore(input.chro?.score, 'CHRO')

  const ctoStatus = input.cto?.status ?? 'UNREAD'
  const cpoStatus = input.cpo?.status ?? 'UNREAD'
  const cfoStatus = input.cfo?.status ?? 'UNREAD'
  const chroStatus = input.chro?.status ?? 'UNREAD'

  const isProvisional =
    ctoStatus === 'UNREAD' ||
    cpoStatus === 'UNREAD' ||
    cfoStatus === 'UNREAD' ||
    chroStatus === 'UNREAD' ||
    input.cto?.score === undefined ||
    input.cpo?.score === undefined ||
    input.cfo?.score === undefined ||
    input.chro?.score === undefined

  const rawBase =
    pmScore * wPm +
    ctoScore * wCto +
    cpoScore * wCpo +
    cfoScore * wCfo +
    chroScore * wChro

  const baseScore = round2(clamp(rawBase, 0, 100))

  let finalScore = baseScore
  let penaltyApplied = false
  let penaltyRate = 0

  if (input.penaltyToApply) {
    penaltyRate = input.penaltyToApply.penaltyRate
    if (penaltyRate < 0 || penaltyRate > 1 || !Number.isFinite(penaltyRate)) {
      throw new Error(`Invalid penaltyRate: ${penaltyRate}. Must be between 0 and 1.`)
    }
    if (penaltyRate > 0) {
      finalScore = round2(clamp(baseScore * (1 - penaltyRate), 0, 100))
      penaltyApplied = true
    }
  }

  return {
    baseScore,
    finalScore,
    isProvisional,
    penaltyApplied,
    penaltyRate,
    execScores: {
      cto: { score: ctoScore, status: ctoStatus },
      cpo: { score: cpoScore, status: cpoStatus },
      cfo: { score: cfoScore, status: cfoStatus },
      chro: { score: chroScore, status: chroStatus },
    },
  }
}

/**
 * Level 1: Developer Weekly Composite KPI Evaluation
 *
 * Formula: sum(taskScore * weightPoints * contextMultiplier) / sum(weightPoints * contextMultiplier)
 * Inactivity Rule: If tasks count is zero or total weight is zero, returns value: null, status: 'NA'.
 */
export function weeklyKpiDeveloper(input: DeveloperWeeklyKpiInput): WeeklyKpiResult {
  if (!input.tasks || input.tasks.length === 0) {
    return {
      value: null,
      status: 'NA',
      reason: 'INACTIVE',
      taskCount: 0,
      totalWeight: 0,
    }
  }

  const multMain = input.multipliers?.MAIN_SQUAD ?? 1.00
  const multOutside = input.multipliers?.OUTSIDE_SQUAD ?? 0.70
  const multIsolated = input.multipliers?.ISOLATED_EXECUTIVE ?? 0.50

  let numerator = 0
  let denominator = 0

  for (const t of input.tasks) {
    if (t.score < 0 || t.score > 100) {
      throw new Error(`Task score out of range [0, 100]: ${t.score}`)
    }
    if (t.weightPoints <= 0) {
      throw new Error(`Task weightPoints must be > 0: ${t.weightPoints}`)
    }

    let multiplier = multMain
    if (t.context === 'OUTSIDE_SQUAD') {
      multiplier = multOutside
    } else if (t.context === 'ISOLATED_EXECUTIVE') {
      multiplier = multIsolated
    }

    const effectiveWeight = t.weightPoints * multiplier
    numerator += t.score * effectiveWeight
    denominator += effectiveWeight
  }

  if (denominator <= 0) {
    return {
      value: null,
      status: 'NA',
      reason: 'INACTIVE',
      taskCount: input.tasks.length,
      totalWeight: 0,
    }
  }

  const rawScore = numerator / denominator
  const score = round2(clamp(rawScore, 0, 100))

  return {
    value: score,
    status: 'OFFICIAL',
    taskCount: input.tasks.length,
    totalWeight: round2(denominator),
  }
}

/**
 * Level 2: Project Manager (PM) Weekly Composite KPI Evaluation
 *
 * Formula: 0.30*CTO + 0.30*CPO + 0.20*CFO + 0.20*CHRO
 * Inactivity Rule: If PM completed zero milestone deliverables/reviews, returns value: null, status: 'NA'.
 */
export function weeklyKpiPm(input: PmWeeklyKpiInput): WeeklyKpiResult {
  if (!input.hasCompletions) {
    return {
      value: null,
      status: 'NA',
      reason: 'INACTIVE',
      taskCount: 0,
    }
  }

  const wCto = input.weights?.cto ?? 0.30
  const wCpo = input.weights?.cpo ?? 0.30
  const wCfo = input.weights?.cfo ?? 0.20
  const wChro = input.weights?.chro ?? 0.20

  if (!validateWeightsSum([wCto, wCpo, wCfo, wChro])) {
    throw new Error(`PM evaluation weights must sum to 1.0. Given: ${[wCto, wCpo, wCfo, wChro].join(', ')}`)
  }

  const resolveScore = (field?: { score?: number; suggestedScore?: number; status?: string }) => {
    if (field?.score !== undefined) {
      if (field.score < 0 || field.score > 100) {
        throw new Error(`PM score out of range [0, 100]: ${field.score}`)
      }
      return { score: field.score, isProvisional: field.status === 'UNREAD' }
    }
    const fallback = field?.suggestedScore ?? 85
    return { score: fallback, isProvisional: true }
  }

  const cto = resolveScore(input.cto)
  const cpo = resolveScore(input.cpo)
  const cfo = resolveScore(input.cfo)
  const chro = resolveScore(input.chro)

  const isProvisional =
    cto.isProvisional || cpo.isProvisional || cfo.isProvisional || chro.isProvisional

  const raw = cto.score * wCto + cpo.score * wCpo + cfo.score * wCfo + chro.score * wChro
  const score = round2(clamp(raw, 0, 100))

  return {
    value: score,
    status: isProvisional ? 'PROVISIONAL' : 'OFFICIAL',
  }
}

/**
 * Calculates Domain Execution component for C-Level: average of weekly KPIs of PMs in that domain.
 * Null/N/A weeks are strictly excluded. If no valid KPIs exist, returns null.
 */
export function domainExecutionFromDepartment(
  pmKpis: Array<{ value: number | null; isInactive?: boolean }>,
): number | null {
  const validScores = pmKpis
    .filter((k) => !k.isInactive && k.value !== null && Number.isFinite(k.value))
    .map((k) => k.value as number)

  if (validScores.length === 0) {
    return null
  }

  const avg = validScores.reduce((acc, curr) => acc + curr, 0) / validScores.length
  return round2(clamp(avg, 0, 100))
}

/**
 * Calculates Peer Synergy component for C-Level: average of ratings from peer executives.
 * Self-rating is strictly excluded.
 */
export function peerSynergy(
  evaluations: Array<{ evaluatorId: string; score: number }>,
  selfId: string,
): number | null {
  const peerScores = evaluations
    .filter((e) => e.evaluatorId !== selfId && Number.isFinite(e.score))
    .map((e) => {
      if (e.score < 0 || e.score > 100) {
        throw new Error(`Peer score out of range [0, 100]: ${e.score}`)
      }
      return e.score
    })

  if (peerScores.length === 0) {
    return null
  }

  const avg = peerScores.reduce((acc, curr) => acc + curr, 0) / peerScores.length
  return round2(clamp(avg, 0, 100))
}

/**
 * Level 3: C-Level Executive (CTO, CPO, CFO, CHRO) Weekly Composite KPI Evaluation
 *
 * Formula: 0.40*CompanyGoal + 0.30*DomainExecution + 0.20*CEOReview + 0.10*PeerSynergy
 */
export function weeklyKpiCLevel(input: CLevelWeeklyKpiInput): WeeklyKpiResult {
  const wGoal = input.weights?.companyGoal ?? 0.40
  const wDomain = input.weights?.domainExecution ?? 0.30
  const wCeo = input.weights?.ceoReview ?? 0.20
  const wPeer = input.weights?.peerSynergy ?? 0.10

  if (!validateWeightsSum([wGoal, wDomain, wCeo, wPeer])) {
    throw new Error(`C-Level weights must sum to 1.0. Given: ${[wGoal, wDomain, wCeo, wPeer].join(', ')}`)
  }

  if (input.domainExecution === null || input.peerSynergy === null) {
    return {
      value: null,
      status: 'INCOMPLETE',
      reason: 'Missing domain execution average or peer synergy evaluations',
    }
  }

  for (const [name, val] of [
    ['companyGoal', input.companyGoal],
    ['domainExecution', input.domainExecution],
    ['ceoReview', input.ceoReview],
    ['peerSynergy', input.peerSynergy],
  ] as const) {
    if (val < 0 || val > 100 || !Number.isFinite(val)) {
      throw new Error(`${name} score out of range [0, 100]: ${val}`)
    }
  }

  const raw =
    input.companyGoal * wGoal +
    input.domainExecution * wDomain +
    input.ceoReview * wCeo +
    input.peerSynergy * wPeer

  return {
    value: round2(clamp(raw, 0, 100)),
    status: 'OFFICIAL',
  }
}

/**
 * Level 4: CEO Weekly Composite KPI Evaluation
 *
 * Formula: 0.60*CompanyPerformance + 0.40*CLevelAggregate
 * CLevelAggregate: Average of the four C-Level final weekly KPIs (ignoring N/A).
 */
export function weeklyKpiCeo(input: CeoWeeklyKpiInput): WeeklyKpiResult {
  const wPerf = input.weights?.companyPerformance ?? 0.60
  const wAgg = input.weights?.cLevelAggregate ?? 0.40

  if (!validateWeightsSum([wPerf, wAgg])) {
    throw new Error(`CEO weights must sum to 1.0. Given: ${wPerf}, ${wAgg}`)
  }

  if (input.companyPerformance < 0 || input.companyPerformance > 100) {
    throw new Error(`Company performance out of range [0, 100]: ${input.companyPerformance}`)
  }

  const validCLevels = input.cLevelFinalKpis
    .filter((k) => !k.isInactive && k.score !== null && Number.isFinite(k.score))
    .map((k) => k.score as number)

  if (validCLevels.length === 0) {
    return {
      value: null,
      status: 'INCOMPLETE',
      reason: 'No official C-Level weekly KPIs available to compute C-Level aggregate',
    }
  }

  const aggregate = validCLevels.reduce((acc, curr) => acc + curr, 0) / validCLevels.length
  const raw = input.companyPerformance * wPerf + aggregate * wAgg

  return {
    value: round2(clamp(raw, 0, 100)),
    status: 'OFFICIAL',
  }
}

/**
 * Applies a CHRO or CEO disciplinary deduction to a finalized weekly KPI.
 *
 * Rules:
 * 1. 0 < points <= 100.
 * 2. Deducted after aggregation. Clamped to >= 0.
 * 3. If week is N/A (null), score remains null; reported separately.
 */
export function applyDisciplinaryDeduction(
  input: DisciplinaryDeductionInput,
): DisciplinaryDeductionResult {
  const { weeklyValue, points } = input

  if (points <= 0 || points > 100 || !Number.isFinite(points)) {
    throw new Error(`Disciplinary deduction points must be in (0, 100]. Given: ${points}`)
  }

  if (weeklyValue === null) {
    return {
      value: null,
      previousValue: null,
      deductionPoints: points,
      deductionApplied: false,
      note: 'Week score was N/A (Inactive); deduction logged as independent record',
    }
  }

  const newValue = round2(Math.max(0, weeklyValue - points))

  return {
    value: newValue,
    previousValue: weeklyValue,
    deductionPoints: points,
    deductionApplied: true,
  }
}
