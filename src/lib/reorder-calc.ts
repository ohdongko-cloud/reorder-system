import type { CalcOldResult, CalcNewResult, PlcStage, Strategy, PrevYearData, StoreExpansion } from '@/types/reorder'
import {
  TOTAL_STORES,
  FIXED_W_OLD,
  SAFETY_FACTOR,
  PLC_T_FACTOR,
  NEW_EFFICIENCY_TIERS,
  SEASON_DAYS,
  DYNAMIC_W_TIERS,
  STRATEGY_W_DELTA,
  STORE_EXPANSION_TARGET_RATIO,
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
  strategy: Strategy = 3,
  storeExpansion: StoreExpansion = 'expand'
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

  const targetRatio = STORE_EXPANSION_TARGET_RATIO[storeExpansion] ?? null
  const effectiveTarget = targetRatio === null ? TOTAL_STORES : stores * targetRatio
  const U = Math.max(0.3, 1 + (effectiveTarget / stores - 1) * eff)
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

// ─────────────────────────────────────────────────────────────────
//  전년 데이터 기반 N/S 보정 유틸
// ─────────────────────────────────────────────────────────────────

/**
 * 전년 동 주간 정상판매량(weekNormSalesQty)을 스타일 단위에서
 * 컬러 단위로 환산한다.
 * 비율 = 해당 컬러의 누적입고량(L) / 스타일 전체 누적입고량 합계
 */
export function calcPrevYearNForColor(
  prevYearWeekNormSales: number,  // 스타일 단위 전년 동 주간 정상판매량
  colorL: number,                 // 해당 컬러 누적입고량
  totalStyleL: number             // 스타일 전체 누적입고량 합계
): number {
  if (totalStyleL <= 0 || prevYearWeekNormSales <= 0) return 0
  const share = colorL / totalStyleL
  return Math.round(prevYearWeekNormSales * share)
}

/**
 * 전년 데이터를 반영한 보정 N 계산.
 * - N_current: 현재 BI_요일판매 기반 주판량
 * - N_prev: 전년 동 주간 정상판매량 (컬러 배분 후)
 * 가중평균: N_adjusted = N_current × 0.5 + N_prev × 0.5
 * N_prev가 0이면 N_current 그대로 반환
 */
export function adjustNWithPrevYear(nCurrent: number, nPrev: number): number {
  if (nPrev <= 0) return nCurrent
  return Math.max(1, Math.round(nCurrent * 0.5 + nPrev * 0.5))
}

/**
 * 전년 PLC 데이터로 잔여 판매 기간(S) 추정.
 * - estRemainWeeks: BI_전년PLC 기준 잔여 예상 주수
 * - sCurrent: 현재 MD 입력 S (혹은 기본값 5)
 * 전년 데이터가 있으면 estRemainWeeks를 S로 사용 (최소 1, 최대 20)
 * 전년 데이터 없으면 sCurrent 반환
 */
export function adjustSWithPrevYear(sCurrent: number, estRemainWeeks: number): number {
  if (estRemainWeeks <= 0) return sCurrent
  return Math.max(1, Math.min(20, estRemainWeeks))
}

/**
 * 전년 누적 판매율로 PLC 보정 days_since_inbound 반환.
 * cumSalesRate > 80% → 쇠퇴기 구간(66일+)으로 보정
 * cumSalesRate 50~80% → 유지기 구간(51~65일)으로 보정
 * cumSalesRate < 50% → 원래 값 유지
 */
export function adjustDaysWithPrevYearSalesRate(
  currentDays: number,
  cumSalesRate: number  // 0~100
): number {
  if (cumSalesRate >= 80 && currentDays < 66) return 70   // 쇠퇴기 강제
  if (cumSalesRate >= 50 && currentDays < 51) return 55   // 유지기로 끌어올림
  return currentDays
}

/**
 * 전년 데이터 보정을 모두 적용한 신규 로직 실행.
 * prevYearData가 없으면 calcNew와 동일하게 작동.
 */
export function calcNewWithPrevYear(
  L: number, M: number, N: number, R: number, S: number, T: number,
  stores: number, plc: PlcStage, daysSinceInbound: number,
  strategy: Strategy,
  prevYearData: PrevYearData | null | undefined,
  totalStyleL: number,   // 스타일 전체 L 합계 (컬러 N_prev 배분용)
  storeExpansion: StoreExpansion = 'expand'
): CalcNewResult | null {
  if (!prevYearData) {
    return calcNew(L, M, N, R, S, T, stores, plc, daysSinceInbound, strategy, storeExpansion)
  }

  // N 보정
  const nPrev = calcPrevYearNForColor(
    prevYearData.style.weekNormSalesQty, L, totalStyleL
  )
  const nAdjusted = adjustNWithPrevYear(N, nPrev)

  // S 보정 (MD 수동 입력 S가 기본값(5)이면 전년 추정값으로 덮어씀)
  const sAdjusted = S === 5  // 기본값이면 전년 데이터 우선 적용
    ? adjustSWithPrevYear(S, prevYearData.plc.estRemainWeeks)
    : S  // MD가 직접 수정한 값이면 그대로 사용

  // PLC 보정 days 계산
  const daysAdjusted = adjustDaysWithPrevYearSalesRate(
    daysSinceInbound,
    prevYearData.style.cumSalesRate
  )

  return calcNew(L, M, nAdjusted, R, sAdjusted, T, stores, plc, daysAdjusted, strategy, storeExpansion)
}

export function calcDeltaPct(oldAd: number, newAd: number): number | null {
  if (oldAd === 0) return null
  return ((newAd - oldAd) / oldAd) * 100
}

export function calcQRate(N: number, L: number): number | null {
  if (!L) return null
  return N / L
}
