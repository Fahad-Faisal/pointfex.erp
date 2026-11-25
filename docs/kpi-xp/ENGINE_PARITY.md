# KPI & XP Engine Parity & Intentional Divergences

**Date:** 17 November 2026  
**Status:** Approved Architecture (Phase 2 Pure Engine)  
**Reference Test Suite:** [`backend/src/performance/kpi-engine/kpi-engine.parity.spec.ts`](../../backend/src/performance/kpi-engine/kpi-engine.parity.spec.ts)  
**Primary Pure Implementation:** [`backend/src/performance/kpi-engine/`](../../backend/src/performance/kpi-engine/)

---

## 1. Executive Summary

This document registers every intentional mathematical divergence between the legacy v3.14.0 prototype (`kpi-engine.service.ts`) and the production-grade pure engine (`src/performance/kpi-engine/`). 

The legacy prototype contained several critical flaws that violated the CHRO memorandum of 12 November 2026. The new pure engine strictly implements the SRS specifications while maintaining mathematical parity where the business rules remain unchanged.

---

## 2. Parity vs Intentional Divergence Matrix

| Dimension | Legacy v3.14.0 Prototype | Pure SRS Engine (Phase 2) | Status | Memorandum Justification |
| :--- | :--- | :--- | :--- | :--- |
| **XP Yield vs Squad Context** | `Math.round(weight * mult * 10)` (Main=1.0, Outside=0.7, Exec=0.5) | `verifiedWeightPoints * 10` strictly invariant to squad context | **INTENTIONAL DIVERGENCE** | XP is a lifetime volume metric reflecting raw effort. Context discounts (0.70/0.50) apply strictly to quality KPI aggregation, never to XP yield. |
| **Massive XP Quorum Threshold** | Hardcoded `weight >= 50` (500 XP) | Configurable `isFrozenThresholdXp` (default 200 XP / weight >= 20) | **INTENTIONAL DIVERGENCE** | 500 XP allowed massive unverified XP accumulation. CHRO policy mandates quorum review for any deliverable yielding $\ge 200$ XP. |
| **Inactivity Return Penalty** | Flat deduction: `Math.max(0, score - 10)` | Multiplicative penalty: $\text{score} \times (1 - 0.10)$ applied once per inactive week FIFO | **INTENTIONAL DIVERGENCE** | Flat -10 wiped out low-score deliverables entirely (e.g., score 8 becomes 0). Multiplicative 10% reduction scales proportionally. |
| **Penalty Target** | Erroneously docked XP yield in prototype scripts | Applies strictly to the quality score of the return task ($S \times 0.90$); never docks XP | **INTENTIONAL DIVERGENCE** | The memorandum prohibits touching or reducing cumulative XP for absence. Inactivity affects quality scores upon resumption. |
| **Inactive Week (Zero Tasks)** | Assigned arbitrary fallback score of `85.0` | Returns `{ value: null, status: 'NA', reason: 'INACTIVE' }` | **INTENTIONAL DIVERGENCE** | Inactive employees must not be awarded free 85% scores. N/A is preserved distinctly from 0 so averages are not distorted. |
| **Task-Level vs Weekly C-Level Receipts** | Faked CTO/CPO/CFO/CHRO auto-fill at weekly aggregate table | Generates discrete `TaskExecScore` records per deliverable on PM evaluation | **INTENTIONAL DIVERGENCE** | Executives review and adjust specific task deliverables, not a synthetic weekly blend. Provisional scores match PM satisfaction until confirmed/adjusted. |
| **Timezone Calendar Boundaries** | Relied on local server UTC/OS date math | Strictly computed in `Asia/Dhaka` (UTC+6) with Monday 00:00 to Sunday 23:59:59.999 boundaries | **INTENTIONAL DIVERGENCE** | Pointfex HQ operations are based in Dhaka. Local server timezones cause boundary drift between UTC and Dhaka weeks. |
| **Level 1 Developer Normal Task Evaluation** | $0.50 \cdot PM + 0.15 \cdot CTO + 0.15 \cdot CPO + 0.10 \cdot CFO + 0.10 \cdot CHRO$ | Same formula ($0.50/0.15/0.15/0.10/0.10$) with provisional matching | **FULL PARITY** | Mathematical weights are identical. |
| **Level 2 PM Weekly Composite** | $0.30 \cdot CTO + 0.30 \cdot CPO + 0.20 \cdot CFO + 0.20 \cdot CHRO$ | Same formula ($0.30/0.30/0.20/0.20$) | **FULL PARITY** | Mathematical weights are identical. |
| **Level 3 C-Level Executive Composite** | $0.40 \cdot Goal + 0.30 \cdot Domain + 0.20 \cdot CEO + 0.10 \cdot Peer$ | Same formula ($0.40/0.30/0.20/0.10$) | **FULL PARITY** | Mathematical weights are identical. |
| **Level 4 CEO Composite** | $0.60 \cdot Company + 0.40 \cdot CLevelAvg$ | Same formula ($0.60/0.40$) | **FULL PARITY** | Mathematical weights are identical. |

---

## 3. Mathematical Proof of Divergence Behaviors

### 3.1 XP Invariance Proof
- **Test Case:** Developer completes an `OUTSIDE_SQUAD` task with `weight = 3` (Large deliverable).
  - Legacy output: $\lfloor 3 \times 0.70 \times 10 \rceil = 21\text{ XP}$.
  - Pure Engine output: $3 \times 10 = 30\text{ XP}$.
  - *Proof:* In SRS §1.1, "XP yield = verifiedWeightPoints * 10, exactly. XP does NOT depend on context multiplier."

### 3.2 Inactivity Penalty Scaling Proof
- **Test Case A (High Score):** Base composite score $S = 90.0$.
  - Legacy output: $\max(0, 90.0 - 10) = 80.0$.
  - Pure Engine output: $90.0 \times (1 - 0.10) = 81.0$.
- **Test Case B (Low Score Boundary):** Base composite score $S = 8.0$.
  - Legacy output: $\max(0, 8.0 - 10) = 0.0$ (Complete loss of credit).
  - Pure Engine output: $8.0 \times 0.90 = 7.20$ (Proportional deduction preserving contribution).

### 3.3 Zero Deliverables Proof
- **Test Case:** Developer completes 0 deliverables during week 46.
  - Legacy output: $85.0$ (Fabricated grade).
  - Pure Engine output: `null` (Status: `NA`, Reason: `INACTIVE`).
  - *Proof:* Zero completed tasks indicates no measurable output. Awarding 85% distorts performance ranking and violates merit principles.

---

## 4. Test Verification

The above matrix is verified via automated assertions in:
```bash
npm test -- src/performance/kpi-engine/kpi-engine.parity.spec.ts
```
All 12 parity and divergence tests pass with 100% determinism.

