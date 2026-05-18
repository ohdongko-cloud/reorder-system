export type StyleType = 'normal' | 'reorder' | 'test_cn'
export type StyleBadge = 'carryover' | 'qr_test' | 're'
export type PlcStage = '도입기' | '성장기' | '유지기' | '쇠퇴기'
export type Strategy = 1 | 2 | 3 | 4 | 5

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
