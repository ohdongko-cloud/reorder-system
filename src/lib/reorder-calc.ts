import type { CalcOldResult, CalcNewResult, PlcStage, Strategy } from '@/types/reorder'
import {
  TOTAL_STORES,
  FIXED_W_OLD,
  SAFETY_FACTOR,
  PLC_T_FACTOR,
  NEW_EFFICIENCY_TIERS,
  SEASON_DAYS,
  DYNAMIC_W_TIERS,
  STRATEGY_W_DELTA,
} from '@/lib/constants'

/**
 * 기존 로직: W=0.3 고정, 이진 효율 (Q>0.15 → 0.9, 그 외 → 0.8)
 */
export function calcOld(
  L: number, M: number, N: number, R: number, S: number, T: number,
  stores: number
): CalcOldResult | null {
  if (!N || !L) return null

  const Q = N / L
  const eff = Q > 0.15 ? 0.9 : 0.8
  const U = 1 + (TOTAL_STORES / stores - 1) * eff
  const V = T * U
  const X = N * V
  const Y = S * X
  const Z = L - M
  const AA = Z - N * R
  const AB = Y - AA
  const AC = (L + AB) / (1 - FIXED_W_OLD) - L
  const AD = Math.max(0, Math.round(AC * SAFETY_FACTOR))

  return { ad: AD, q: Q, u: U }
}

/**
 * 신규 로직: PLC 보정 T값, 4단계 효율, 동적 W + 발주전략 조정
 */
export function calcNew(
  L: number, M: number, N: number, R: number, S: number, T: number,
  stores: number, plc: PlcStage, daysSinceInbound: number,
  strategy: Strategy = 3
): CalcNewResult | null {
  if (!N || !L) return null

  const Q = N / L

  // PLC 보정 T
  const tFactor = PLC_T_FACTOR[plc] ?? 1.0
  const tAdjusted = T * tFactor

  // 4단계 효율
  let eff = NEW_EFFICIENCY_TIERS[NEW_EFFICIENCY_TIERS.length - 1][1]
  for (const [threshold, e] of NEW_EFFICIENCY_TIERS) {
    if (Q > threshold) { eff = e; break }
  }

  const U = 1 + (TOTAL_STORES / stores - 1) * eff
  const V = tAdjusted * U
  const X = N * V
  const Y = S * X
  const Z = L - M
  const AA = Z - N * R
  const AB = Y - AA

  // 동적 W (시즌 진행률 기반) + 발주전략 조정
  const prog = Math.min(daysSinceInbound / SEASON_DAYS, 1)
  let W = DYNAMIC_W_TIERS[DYNAMIC_W_TIERS.length - 1][1]
  for (const [threshold, w] of DYNAMIC_W_TIERS) {
    if (prog >= threshold) { W = w; break }
  }
  const wDelta = STRATEGY_W_DELTA[strategy] ?? 0
  W = Math.max(0.01, Math.min(0.99, W + wDelta))

  const AC = (L + AB) / (1 - W) - L
  const AD = Math.max(0, Math.round(AC * SAFETY_FACTOR))

  return { ad: AD, q: Q, u: U, w: W, tAdjusted }
}

export function calcDeltaPct(oldAd: number, newAd: number): number | null {
  if (oldAd === 0) return null
  return ((newAd - oldAd) / oldAd) * 100
}

export function calcQRate(N: number, L: number): number | null {
  if (!L) return null
  return N / L
}
