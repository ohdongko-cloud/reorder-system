import * as XLSX from 'xlsx'
import type { StyleRow, ColorRow, PlcStage, Strategy, PrevYearStyleData, PrevYearPlcData, PrevYearData } from '@/types/reorder'
import { inferStyleType, inferPlc, inferBadges } from '@/lib/constants'
import { v4 as uuidv4 } from 'uuid'

export interface ParseResult {
  styles: Omit<StyleRow, 'session_id'>[]
  errors: string[]
  sheetName: string
}

// ─────────────────────────────────────────────
//  BI_스타일별전년 시트 컬럼 (0-based)
// ─────────────────────────────────────────────
const PREV_YEAR_STYLE = {
  styleCode:        3,   // 스타일코드(Now)
  mdpType:         14,   // MDP유형(Now)
  orderQty:        15,   // 발주량
  cumInboundQty:   19,   // 누적입고량
  cumSalesQty:     25,   // 누적 판매량
  weekSalesQty:    26,   // 기간 판매량
  cumNormSalesQty: 33,   // 누적 정상판매량
  weekNormSalesQty:34,   // 기간 정상판매량 ← N_prev 핵심
  cumSalesRate:    39,   // 누적 입고대비정판율 (%)
  weekSalesRate:   40,   // 기간판매율[입고대비] (%)
}

// ─────────────────────────────────────────────
//  BI_전년PLC 시트 컬럼 (0-based)
// ─────────────────────────────────────────────
const PREV_PLC = {
  styleCode:    3,   // 스타일코드(Now)
  totalSales:  13,   // 전체 결과 (총 누적 정상판매량)
  weeklyStart: 14,   // 주별 데이터 시작 (14~55, 42개 주차)
}
const PREV_PLC_WEEK_COUNT = 42  // 14~55 = 42개 컬럼

// ─────────────────────────────────────────────
//  BI 시트 컬럼 (0-based)
// ─────────────────────────────────────────────
const BI = {
  styleCode:    2,   // C  스타일코드
  priceFixed:   4,   // E  결판가
  firstInbound: 6,   // G  최초입고일
  color:        12,  // M  컬러(Now)
  orderQty:     13,  // N  발주량          → k
  inboundQty:   17,  // R  누적입고량       → l
  salesStock:   39,  // AN 판매재고량(입고-누판) → m = l − AN
}

// ─────────────────────────────────────────────
//  분배확정 시트 컬럼 (0-based)
// ─────────────────────────────────────────────
const DIST = {
  styleCode: 3,  // D  스타일
  stores:    4,  // E  매장수
  qty:       5,  // F  분배량 → aj 기초값
}

// ─────────────────────────────────────────────
//  BI_요일판매 시트 컬럼 (0-based)
// ─────────────────────────────────────────────
const WEEKLY = {
  styleCode:  2,  // C  스타일코드
  salesStart: 3,  // D  일별 판매액 시작 (28일치)
}
const WEEKLY_DAYS = 28   // 조회 기간 일수
const WEEKLY_PER_QUERY = WEEKLY_DAYS / 7  // ≒ 4주

// ─────────────────────────────────────────────
//  메인 파서
// ─────────────────────────────────────────────
export async function parseReorderExcel(buffer: ArrayBuffer): Promise<ParseResult> {
  const wb = XLSX.read(buffer, { type: 'array' })

  if (wb.SheetNames.includes('BI')) {
    return parseFromBISheets(wb)
  }
  // 레거시 폴백: 리오더예상_CHECK 시트
  return parseFromCheckSheet(wb)
}

// ─────────────────────────────────────────────
//  BI + 분배확정 + BI_요일판매 파싱
// ─────────────────────────────────────────────
function parseFromBISheets(wb: XLSX.WorkBook): ParseResult {
  const errors: string[] = []

  // ── 1. 참조일 파싱 (BI 헤더 row2 → "2026-04-20 - 2026-04-26") ──
  const biWs = wb.Sheets['BI']!
  const biRows: unknown[][] = XLSX.utils.sheet_to_json(biWs, { header: 1, defval: '' })
  const refDateStr = String((biRows[1] as unknown[])?.[1] ?? '')
  const refDate = parseRefDate(refDateStr)

  // ── 2. BI_요일판매 → styleCode: weeklyQty 맵 ──
  const weeklyMap = buildWeeklyMap(wb)

  // ── 3. 분배확정 → styleCode: { maxStores, totalQty } ──
  const distMap = buildDistributionMap(wb)

  // ── 3a. 전년 데이터 맵 (시트 없으면 빈 맵) ──
  const prevYearStyleMap = buildPrevYearStyleMap(wb)
  const prevYearPlcMap   = buildPrevYearPlcMap(wb, refDateStr)

  // ── 4. BI 시트 파싱 ──
  // styleCode → { colors, price, firstInbound, totalL }
  type StyleAccum = {
    id: string
    code: string
    price: number
    firstInbound: Date | null
    colors: Array<{
      id: string
      colorName: string
      k: number; l: number; m: number
    }>
    totalL: number
  }
  const styleMap = new Map<string, StyleAccum>()

  for (let i = 8; i < biRows.length; i++) {
    const row = biRows[i] as unknown[]
    const colorName = String(row[BI.color] ?? '').trim()
    // 결과(소계) 행, (NA) 집계 행, 빈 행 제외
    if (!colorName || colorName === '결과' || colorName.startsWith('(NA)')) continue

    const styleCode = String(row[BI.styleCode] ?? '').trim()
    if (!styleCode.startsWith('MI')) continue

    const price    = toInt(row[BI.priceFixed])
    const k        = toInt(row[BI.orderQty])
    const l        = toInt(row[BI.inboundQty])
    const stock    = toInt(row[BI.salesStock])   // 판매재고량
    const m        = Math.max(0, l - stock)       // 누판량 = 입고 - 재고

    const rawDate  = row[BI.firstInbound]
    const inbDate  = parseExcelDate(rawDate)

    if (!styleMap.has(styleCode)) {
      styleMap.set(styleCode, {
        id: uuidv4(),
        code: styleCode,
        price,
        firstInbound: inbDate,
        colors: [],
        totalL: 0,
      })
    }
    const accum = styleMap.get(styleCode)!
    accum.colors.push({ id: uuidv4(), colorName, k, l, m })
    accum.totalL += l
    if (!accum.firstInbound && inbDate) accum.firstInbound = inbDate
    if (accum.price === 0 && price > 0) accum.price = price
  }

  if (styleMap.size === 0) {
    errors.push('BI 시트에서 MI 스타일 데이터를 찾을 수 없습니다.')
    return { styles: [], errors, sheetName: 'BI' }
  }

  // ── 5. 결합 ──
  const styles: Omit<StyleRow, 'session_id'>[] = []

  for (const [styleCode, accum] of styleMap) {
    const dist    = distMap.get(styleCode)
    const stores  = dist?.maxStores ?? 50
    const ajTotal = dist?.totalQty  ?? 0

    const days = accum.firstInbound
      ? dateDiffDays(accum.firstInbound, refDate)
      : 0
    const plc: PlcStage = inferPlc(days)

    // 주판량 (n) 배분: 스타일 주간 수량 → 컬러별 입고 비율로 분배
    const styleWeeklyQty = weeklyMap.get(styleCode) ?? 0
    const stylePriceForWeekly = accum.price || 1

    // BI_요일판매는 판매금액 기준이므로 단가로 나눠 수량 환산
    const weeklyQtyByUnit = styleWeeklyQty / stylePriceForWeekly

    const colors: ColorRow[] = accum.colors.map(c => {
      const share   = accum.totalL > 0 ? c.l / accum.totalL : 1 / accum.colors.length
      const n       = Math.round(weeklyQtyByUnit * share)
      const aj      = Math.round(ajTotal * share)

      return {
        id: c.id,
        style_id: accum.id,
        color_name: c.colorName,
        color_hex: null,
        k: c.k,
        l: c.l,
        m: c.m,
        n,
        r: 5,
        s: 8,
        t: 1.0,
        weight: 1.0,
        strategy: 3 as Strategy,
        aj,
      }
    })

    // ── 전년 데이터 결합 ──
    const prevStyle = prevYearStyleMap.get(styleCode) ?? null
    const prevPlc   = prevYearPlcMap.get(styleCode)   ?? null
    const prevYear: PrevYearData | null = (prevStyle && prevPlc)
      ? { style: prevStyle, plc: prevPlc }
      : null

    styles.push({
      id: accum.id,
      code: styleCode,
      type: inferStyleType(styleCode),
      badges: inferBadges(styleCode),
      price: accum.price,
      days_since_inbound: days,
      stores,
      plc,
      strategy: 3,
      colors,
      prevYear,
    })
  }

  return { styles, errors, sheetName: 'BI' }
}

// ─────────────────────────────────────────────
//  BI_스타일별전년 → styleCode: PrevYearStyleData 맵
// ─────────────────────────────────────────────
function buildPrevYearStyleMap(wb: XLSX.WorkBook): Map<string, PrevYearStyleData> {
  const map = new Map<string, PrevYearStyleData>()
  // 시트명 대소문자 무관 탐지
  const sheetName = wb.SheetNames.find(n =>
    n.replace(/[_\s]/g, '').toLowerCase().includes('스타일별전년') ||
    n.replace(/[_\s]/g, '').toLowerCase().includes('스타일전년')
  )
  if (!sheetName) return map

  const ws = wb.Sheets[sheetName]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  // 행 5+ : 스타일 개별 데이터 (행4=헤더, 행5=집계)
  for (let i = 5; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    const styleCode = String(row[PREV_YEAR_STYLE.styleCode] ?? '').trim()
    if (!styleCode.startsWith('MI')) continue

    map.set(styleCode, {
      orderQty:         toInt(row[PREV_YEAR_STYLE.orderQty]),
      cumInboundQty:    toInt(row[PREV_YEAR_STYLE.cumInboundQty]),
      cumSalesQty:      toInt(row[PREV_YEAR_STYLE.cumSalesQty]),
      weekSalesQty:     toInt(row[PREV_YEAR_STYLE.weekSalesQty]),
      cumNormSalesQty:  toInt(row[PREV_YEAR_STYLE.cumNormSalesQty]),
      weekNormSalesQty: toInt(row[PREV_YEAR_STYLE.weekNormSalesQty]),
      cumSalesRate:     toFloat(row[PREV_YEAR_STYLE.cumSalesRate]),
      weekSalesRate:    toFloat(row[PREV_YEAR_STYLE.weekSalesRate]),
    })
  }
  return map
}

// ─────────────────────────────────────────────
//  BI_전년PLC → styleCode: PrevYearPlcData 맵
// ─────────────────────────────────────────────
function buildPrevYearPlcMap(wb: XLSX.WorkBook, refDateStr: string): Map<string, PrevYearPlcData> {
  const map = new Map<string, PrevYearPlcData>()
  const sheetName = wb.SheetNames.find(n =>
    n.replace(/[_\s]/g, '').toLowerCase().includes('전년plc') ||
    n.replace(/[_\s]/g, '').toLowerCase().includes('전년plc')
  )
  if (!sheetName) return map

  const ws = wb.Sheets[sheetName]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  // 행4 = 컬럼 헤더
  const header = rows[4] as unknown[]

  // 현재 주차 컬럼 찾기: refDateStr "yyyy-MM-dd - yyyy-MM-dd" → "MM/DD~MM/DD"
  const currentWeekKey = refDateStrToWeekKey(refDateStr)
  let currentColIdx = -1
  if (currentWeekKey) {
    for (let c = PREV_PLC.weeklyStart; c < header.length; c++) {
      if (String(header[c] ?? '').replace(/\s/g, '') === currentWeekKey) {
        currentColIdx = c
        break
      }
    }
  }
  // 못 찾으면 가장 마지막 주차 전주 사용 (폴백)
  if (currentColIdx < 0) {
    currentColIdx = Math.min(PREV_PLC.weeklyStart + 20, (header.length - 1))
  }

  // 행 8+ : 스타일 개별 데이터
  for (let i = 8; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    const styleCode = String(row[PREV_PLC.styleCode] ?? '').trim()
    if (!styleCode.startsWith('MI')) continue

    const weeklyNormSales: number[] = []
    for (let c = PREV_PLC.weeklyStart; c < PREV_PLC.weeklyStart + PREV_PLC_WEEK_COUNT; c++) {
      weeklyNormSales.push(toInt(row[c]))
    }

    const totalNormSales   = toInt(row[PREV_PLC.totalSales])
    const relIdx           = currentColIdx - PREV_PLC.weeklyStart
    const currentWeekSales = toInt(row[currentColIdx])

    // 현재 주차까지 누적 (inclusive)
    let salesBeforeCurrent = 0
    for (let j = 0; j <= Math.min(relIdx, weeklyNormSales.length - 1); j++) {
      salesBeforeCurrent += weeklyNormSales[j]
    }

    const salesAfterCurrent = Math.max(0, totalNormSales - salesBeforeCurrent)

    // 잔여 예상 주수: 잔여량 / 현재 주판량 (최소 1)
    const estRemainWeeks = currentWeekSales > 0
      ? Math.max(1, Math.round(salesAfterCurrent / currentWeekSales))
      : 0

    map.set(styleCode, {
      totalNormSales,
      salesBeforeCurrent,
      salesAfterCurrent,
      currentWeekSales,
      estRemainWeeks,
      weeklyNormSales,
    })
  }
  return map
}

// ─────────────────────────────────────────────
//  유틸: refDateStr → "MM/DD~MM/DD" 변환
//  "2025-05-12 - 2025-05-18" → "05/12~05/18"
// ─────────────────────────────────────────────
function refDateStrToWeekKey(refDateStr: string): string | null {
  // 패턴: YYYY-MM-DD - YYYY-MM-DD
  const m = refDateStr.match(/(\d{4})-(\d{2})-(\d{2})\s*-\s*\d{4}-(\d{2})-(\d{2})/)
  if (!m) return null
  const startMM = m[2], startDD = m[3]
  const endMM   = m[4], endDD   = m[5]
  return `${startMM}/${startDD}~${endMM}/${endDD}`
}

// ─────────────────────────────────────────────
//  BI_요일판매 → styleCode: 판매액합계 맵
// ─────────────────────────────────────────────
function buildWeeklyMap(wb: XLSX.WorkBook): Map<string, number> {
  const map = new Map<string, number>()
  const ws = wb.Sheets['BI_요일판매']
  if (!ws) return map

  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  // row index 6 = aggregate/header, data from index 7
  for (let i = 7; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    const styleCode = String(row[WEEKLY.styleCode] ?? '').trim()
    if (!styleCode.startsWith('MI')) continue

    let totalAmount = 0
    for (let c = WEEKLY.salesStart; c < row.length; c++) {
      const v = toFloat(row[c])
      if (v > 0) totalAmount += v
    }
    // 주간 판매액 = 기간합계 / 기간주수
    const existing = map.get(styleCode) ?? 0
    map.set(styleCode, existing + totalAmount / WEEKLY_PER_QUERY)
  }
  return map
}

// ─────────────────────────────────────────────
//  분배확정 → styleCode: { maxStores, totalQty } 맵
// ─────────────────────────────────────────────
function buildDistributionMap(wb: XLSX.WorkBook): Map<string, { maxStores: number; totalQty: number }> {
  const map = new Map<string, { maxStores: number; totalQty: number }>()
  const ws = wb.Sheets['분배확정']
  if (!ws) return map

  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    const styleCode = String(row[DIST.styleCode] ?? '').trim()
    if (!styleCode.startsWith('MI')) continue

    const stores = toInt(row[DIST.stores])
    const qty    = toInt(row[DIST.qty])

    const existing = map.get(styleCode)
    if (!existing) {
      map.set(styleCode, { maxStores: stores, totalQty: qty })
    } else {
      existing.maxStores = Math.max(existing.maxStores, stores)
      existing.totalQty += qty
    }
  }
  return map
}

// ─────────────────────────────────────────────
//  레거시 폴백: 리오더예상_CHECK 시트 파싱
// ─────────────────────────────────────────────
function parseFromCheckSheet(wb: XLSX.WorkBook): ParseResult {
  const errors: string[] = []

  const targetSheet = wb.SheetNames.find(n => n.includes('리오더예상') || n.includes('CHECK'))
    ?? wb.SheetNames[0]
  const ws = wb.Sheets[targetSheet]
  if (!ws) {
    return { styles: [], errors: ['유효한 시트를 찾을 수 없습니다.'], sheetName: '' }
  }

  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

  // 리오더예상_CHECK 실제 컬럼 매핑
  const CHECK = {
    styleCode: 1,   // B
    price:     5,   // F 결판가
    days:      7,   // H 판매일수
    stores:    8,   // I 매장수
    n:         13,  // N 주판량
    r:         17,  // R 입고예정
    s:         18,  // S 입고후판매기간
    t:         19,  // T 입고후주판량비율
    aj:        35,  // AJ 수량(확정발주)
  }

  let lastStyleCode = ''
  let lastPrice = 0, lastDays = 0, lastStores = 1

  const styleMap = new Map<string, Omit<StyleRow, 'session_id'>>()

  for (let ri = 6; ri < rows.length; ri++) {
    const row = rows[ri] as unknown[]
    if (!row) continue

    const rawCode = String(row[CHECK.styleCode] ?? '').trim()
    if (rawCode.startsWith('MI')) {
      lastStyleCode = rawCode
      lastPrice  = toInt(row[CHECK.price])
      lastDays   = toInt(row[CHECK.days])
      lastStores = toInt(row[CHECK.stores]) || 1
    }
    if (!lastStyleCode) continue

    const n  = toInt(row[CHECK.n])
    const r  = toFloat(row[CHECK.r]) || 5
    const s  = toFloat(row[CHECK.s]) || 8
    const t  = toFloat(row[CHECK.t]) || 1.0
    const aj = toInt(row[CHECK.aj])
    if (n === 0 && r === 0 && s === 0 && t === 0) continue

    const color: ColorRow = {
      id: uuidv4(),
      style_id: '',
      color_name: `컬러${(styleMap.get(lastStyleCode)?.colors.length ?? 0) + 1}`,
      color_hex: null,
      k: 0, l: 0, m: 0, n, r, s, t, weight: 1.0, strategy: 3 as Strategy, aj,
    }

    if (!styleMap.has(lastStyleCode)) {
      styleMap.set(lastStyleCode, {
        id: uuidv4(),
        code: lastStyleCode,
        type: inferStyleType(lastStyleCode),
        badges: inferBadges(lastStyleCode),
        price: lastPrice,
        days_since_inbound: lastDays,
        stores: lastStores,
        plc: inferPlc(lastDays),
        strategy: 3,
        colors: [],
      })
    }
    const style = styleMap.get(lastStyleCode)!
    color.style_id = style.id
    style.colors.push(color)
  }

  if (styleMap.size === 0) {
    errors.push('스타일 코드를 찾을 수 없습니다. 컬럼 구조를 확인하세요.')
  }
  return { styles: Array.from(styleMap.values()), errors, sheetName: targetSheet }
}

// ─────────────────────────────────────────────
//  유틸리티
// ─────────────────────────────────────────────

function parseRefDate(header: string): Date {
  // "2026-04-20 - 2026-04-26" → 2026-04-26
  const match = header.match(/(\d{4}-\d{2}-\d{2})\s*$/)
  if (match) return new Date(match[1])
  return new Date()
}

function parseExcelDate(v: unknown): Date | null {
  if (!v) return null
  if (typeof v === 'string' && v.match(/^\d{4}-\d{2}-\d{2}/)) {
    return new Date(v)
  }
  if (typeof v === 'number' && v > 30000) {
    // Excel serial date (Windows epoch: 1900-01-00)
    return new Date(Math.round((v - 25569) * 86400 * 1000))
  }
  return null
}

function dateDiffDays(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime()
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)))
}

function toInt(v: unknown): number {
  const n = Number(v)
  return isNaN(n) ? 0 : Math.round(n)
}

function toFloat(v: unknown): number {
  const n = Number(v)
  return isNaN(n) ? 0 : n
}
