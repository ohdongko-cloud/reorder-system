export type StyleType = 'normal' | 'reorder' | 'test_cn'
export type StyleBadge = 'carryover' | 'qr_test' | 're'
export type PlcStage = '도입기' | '성장기' | '유지기' | '쇠퇴기'
export type Strategy = 1 | 2 | 3 | 4 | 5

// ─── 전년 데이터 타입 ────────────────────────────────────────────────

/** BI_스타일별전년 시트 파싱 결과 (전년 동 주간 실적) */
export interface PrevYearStyleData {
  orderQty: number          // 발주량
  cumInboundQty: number     // 누적입고량
  cumSalesQty: number       // 누적 판매량
  weekSalesQty: number      // 기간(동 주간) 판매량
  cumNormSalesQty: number   // 누적 정상판매량
  weekNormSalesQty: number  // 기간 정상판매량 ← N_prev 핵심
  cumSalesRate: number      // 누적 입고대비 판매율 (0~100)
  weekSalesRate: number     // 기간 판매율 (0~100)
}

/** BI_전년PLC 시트 파싱 결과 (전년 시즌 주별 판매 곡선) */
export interface PrevYearPlcData {
  totalNormSales: number      // 전년 시즌 총 정상판매량
  salesBeforeCurrent: number  // 현재 주차까지 누적 판매량
  salesAfterCurrent: number   // 현재 주차 이후 잔여 판매량
  currentWeekSales: number    // 현재 주차 판매량
  estRemainWeeks: number      // 잔여 예상 주수
  weeklyNormSales: number[]   // 56주 주별 배열 (index 0 = 첫 주)
}

/** 스타일 단위 전년 통합 데이터 */
export interface PrevYearData {
  style: PrevYearStyleData
  plc: PrevYearPlcData
}

export interface ColorRow {
  id: string
  style_id: string
  color_name: string
  color_hex: string | null
  // Base data (from Excel BI sheet, read-only after upload)
  k: number   // 누적발주(생산)수량
  l: number   // 누적입고수량
  m: number   // 누적판매량 (= l - stock)
  // MD inputs (editable)
  n: number   // 주판량 (개/주)
  r: number   // 재고조정 배수
  s: number   // 판매기간 (주) — default 5
  t: number   // T값 (입고후주판량비율 배수)
  weight: number  // 가중치 (default 1.0, range 1.0~2.0)
  strategy: Strategy  // 발주성향 per-color (default 3)
  // 확정발주
  aj: number
  // Computed (client-side)
  calcOld?: number | null
  calcNew?: number | null
  qRate?: number | null    // 주판율 = N/(L-M)
  uOld?: number | null
  uNew?: number | null
  wUsed?: number | null
  delta?: number | null    // (신규-기존)/기존 %
}

export interface StyleRow {
  id: string
  session_id: string
  code: string
  type: StyleType
  badges: StyleBadge[]  // 0~3개 복수 뱃지
  price: number
  days_since_inbound: number
  stores: number
  plc: PlcStage
  colors: ColorRow[]
  strategy: Strategy
  prevYear?: PrevYearData | null  // 전년 동 주간 + PLC 데이터 (없으면 null)
}

export interface ReorderSession {
  id: string
  name: string
  base_date: string
  created_by: string | null
  created_at: string
  style_count?: number
}

export interface CalcOldResult {
  ad: number
  q: number
  u: number
}

export interface CalcNewResult {
  ad: number
  q: number
  u: number
  w: number
  tAdjusted: number
}

export interface SubtotalRow {
  oldSum: number
  newSum: number
  ajSum: number
}
