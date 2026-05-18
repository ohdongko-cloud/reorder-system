import * as XLSX from 'xlsx'
import type { StyleRow, ColorRow, PlcStage, Strategy, PrevYearStyleData, PrevYearPlcData, PrevYearData, PrevYearStyleCandidate } from '@/types/reorder'
import { inferStyleType, inferPlc, inferBadges } from '@/lib/constants'
import { v4 as uuidv4 } from 'uuid'

export interface ParseResult {
  styles: Omit<StyleRow, 'session_id'>[]
  errors: string[]
  sheetName: string
  prevYearCandidates: PrevYearStyleCandidate[]  // TModal 전년 상품 검색용
  styleNameMap: Record<string, string>          // 현재연도 코드 → 상품명 매핑
}

// ─────────────────────────────────────────────
//  BI_스타일별전년 시트 컬럼 (0-based)
// ─────────────────────────────────────────────
const PREV_YEAR_STYLE = {
  styleCode:        3,   // 스타일코드(Now)
  styleName:        4,   // 상품명
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
  // BI_스타일별전년 헤더에서 전년 참조 주차를 별도로 읽음 (BI는 2026, 전년시트는 2025)
  const prevYearRefDateStr = readPrevYearRefDate(wb)
  const { exactMap: prevStyleExact, categoryMap: prevStyleCategory, rawMap: prevStyleRaw } = buildPrevYearStyleMap(wb)
  const { exactMap: prevPlcExact,   categoryMap: prevPlcCategory,   rawMap: prevPlcRaw   } = buildPrevYearPlcMap(wb, prevYearRefDateStr)

  // 전년 상품 후보 리스트 (TModal 상품명 검색용)
  const prevYearCandidates = buildPrevYearCandidateList(prevStyleRaw, prevPlcRaw)

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
    return { styles: [], errors, sheetName: 'BI', prevYearCandidates: [], styleNameMap: {} }
  }

  // ── 5. 결합 ──
  const styles: Omit<StyleRow, 'session_id'>[] = []
  const styleNameMap: Record<string, string> = {}

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

    // ── 전년 데이터 결합 (3단계 매칭) ──
    const suffixKey  = getItemSuffixKey(styleCode)
    const itemCatKey = getItemCategoryKey(styleCode)

    // 1단계: 정확한 연도 무관 매칭 (캐리오버, 연도만 다른 동일 디자인)
    let prevStyle = suffixKey ? (prevStyleExact.get(suffixKey) ?? null) : null
    let prevPlc   = suffixKey ? (prevPlcExact.get(suffixKey)   ?? null) : null

    // 2단계: 아이템 카테고리 평균 폴백 (신규 스타일)
    if (!prevStyle && itemCatKey) prevStyle = prevStyleCategory.get(itemCatKey) ?? null
    if (!prevPlc   && itemCatKey) prevPlc   = prevPlcCategory.get(itemCatKey)   ?? null

    const prevYear: PrevYearData | null = (prevStyle && prevPlc)
      ? { style: prevStyle, plc: prevPlc }
      : null

    // 상품명: 정확한 suffix 매칭된 전년 데이터에서 가져옴
    const styleName = prevStyle?.styleName ?? ''
    if (styleName) styleNameMap[styleCode] = styleName

    styles.push({
      id: accum.id,
      code: styleCode,
      name: styleName || undefined,
      type: inferStyleType(styleCode),
      badges: inferBadges(styleCode),
      price: accum.price,
      days_since_inbound: days,
      stores,
      plc,
      strategy: 3,
      store_expansion: 'expand',
      colors,
      prevYear,
    })
  }

  return { styles, errors, sheetName: 'BI', prevYearCandidates, styleNameMap }
}

// ─────────────────────────────────────────────
//  스타일 코드 키 유틸 (연도 문자 제거)
//  MIA0AG301B → "0A_301B"  (item_suffix, 연도 문자 pos5 제거)
// ─────────────────────────────────────────────
function getItemSuffixKey(code: string): string | null {
  if (code.length < 7) return null
  return code.slice(3, 5) + '_' + code.slice(6)   // item(2) + '_' + suffix(pos6~)
}

function getItemCategoryKey(code: string): string | null {
  if (code.length < 5) return null
  return code.slice(3, 5)   // item 2글자
}

// ─────────────────────────────────────────────
//  BI_스타일별전년 → 2종 맵 반환
//   exactMap:    suffixKey(연도 제거) → PrevYearStyleData  (1단계 정확 매칭용)
//   categoryMap: itemCatKey(2글자)   → PrevYearStyleData  (2단계 평균 폴백용)
// ─────────────────────────────────────────────
function buildPrevYearStyleMap(wb: XLSX.WorkBook): {
  exactMap:    Map<string, PrevYearStyleData>
  categoryMap: Map<string, PrevYearStyleData>
  rawMap:      Map<string, PrevYearStyleData>   // 원본 스타일코드 → 데이터 (후보 리스트용)
} {
  const exactMap    = new Map<string, PrevYearStyleData>()
  const categoryMap = new Map<string, PrevYearStyleData>()
  const rawMap      = new Map<string, PrevYearStyleData>()

  const sheetName = wb.SheetNames.find(n =>
    n.replace(/[_\s]/g, '').toLowerCase().includes('스타일별전년') ||
    n.replace(/[_\s]/g, '').toLowerCase().includes('스타일전년')
  )
  if (!sheetName) return { exactMap, categoryMap, rawMap }

  const ws   = wb.Sheets[sheetName]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  // 아이템 카테고리별 누적값 (평균 계산용)
  type CatAccum = {
    weekNormSalesQty: number; weekSalesQty: number
    cumNormSalesQty: number;  cumSalesQty: number
    cumSalesRate: number;     weekSalesRate: number
    orderQty: number;         cumInboundQty: number
    count: number
  }
  const catAccum = new Map<string, CatAccum>()

  // 행 5+ : 스타일 개별 데이터 (행4=헤더, 행5=집계)
  for (let i = 5; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    const styleCode = String(row[PREV_YEAR_STYLE.styleCode] ?? '').trim()
    if (!styleCode.startsWith('MI')) continue

    const styleName = String(row[PREV_YEAR_STYLE.styleName] ?? '').trim()

    const data: PrevYearStyleData = {
      styleName,
      orderQty:         toInt(row[PREV_YEAR_STYLE.orderQty]),
      cumInboundQty:    toInt(row[PREV_YEAR_STYLE.cumInboundQty]),
      cumSalesQty:      toInt(row[PREV_YEAR_STYLE.cumSalesQty]),
      weekSalesQty:     toInt(row[PREV_YEAR_STYLE.weekSalesQty]),
      cumNormSalesQty:  toInt(row[PREV_YEAR_STYLE.cumNormSalesQty]),
      weekNormSalesQty: toInt(row[PREV_YEAR_STYLE.weekNormSalesQty]),
      cumSalesRate:     toFloat(row[PREV_YEAR_STYLE.cumSalesRate]),
      weekSalesRate:    toFloat(row[PREV_YEAR_STYLE.weekSalesRate]),
    }

    // 원본 코드 맵 (후보 리스트 생성용)
    rawMap.set(styleCode, data)

    // 1단계 맵: suffixKey(연도 제거)
    const suffixKey = getItemSuffixKey(styleCode)
    if (suffixKey) exactMap.set(suffixKey, data)

    // 카테고리 누적 (2단계 평균용)
    const catKey = getItemCategoryKey(styleCode)
    if (catKey) {
      const acc = catAccum.get(catKey)
      if (!acc) {
        catAccum.set(catKey, {
          weekNormSalesQty: data.weekNormSalesQty,
          weekSalesQty:     data.weekSalesQty,
          cumNormSalesQty:  data.cumNormSalesQty,
          cumSalesQty:      data.cumSalesQty,
          cumSalesRate:     data.cumSalesRate,
          weekSalesRate:    data.weekSalesRate,
          orderQty:         data.orderQty,
          cumInboundQty:    data.cumInboundQty,
          count: 1,
        })
      } else {
        acc.weekNormSalesQty += data.weekNormSalesQty
        acc.weekSalesQty     += data.weekSalesQty
        acc.cumNormSalesQty  += data.cumNormSalesQty
        acc.cumSalesQty      += data.cumSalesQty
        acc.cumSalesRate     += data.cumSalesRate
        acc.weekSalesRate    += data.weekSalesRate
        acc.orderQty         += data.orderQty
        acc.cumInboundQty    += data.cumInboundQty
        acc.count++
      }
    }
  }

  // 2단계 맵: 카테고리 평균 (styleName은 빈 문자열)
  for (const [catKey, acc] of catAccum) {
    const n = acc.count
    categoryMap.set(catKey, {
      styleName:        '',
      orderQty:         Math.round(acc.orderQty         / n),
      cumInboundQty:    Math.round(acc.cumInboundQty    / n),
      cumSalesQty:      Math.round(acc.cumSalesQty      / n),
      weekSalesQty:     Math.round(acc.weekSalesQty     / n),
      cumNormSalesQty:  Math.round(acc.cumNormSalesQty  / n),
      weekNormSalesQty: Math.round(acc.weekNormSalesQty / n),
      cumSalesRate:     acc.cumSalesRate  / n,
      weekSalesRate:    acc.weekSalesRate / n,
    })
  }

  return { exactMap, categoryMap, rawMap }
}

// ─────────────────────────────────────────────
//  BI_전년PLC → 2종 맵 반환
//   exactMap:    suffixKey → PrevYearPlcData
//   categoryMap: itemCatKey → PrevYearPlcData (카테고리 평균)
// ─────────────────────────────────────────────
function buildPrevYearPlcMap(wb: XLSX.WorkBook, refDateStr: string): {
  exactMap:    Map<string, PrevYearPlcData>
  categoryMap: Map<string, PrevYearPlcData>
  rawMap:      Map<string, PrevYearPlcData>   // 원본 스타일코드 → 데이터 (후보 리스트용)
} {
  const exactMap    = new Map<string, PrevYearPlcData>()
  const categoryMap = new Map<string, PrevYearPlcData>()
  const rawMap      = new Map<string, PrevYearPlcData>()

  const sheetName = wb.SheetNames.find(n =>
    n.replace(/[_\s]/g, '').toLowerCase().includes('전년plc')
  )
  if (!sheetName) return { exactMap, categoryMap, rawMap }

  const ws   = wb.Sheets[sheetName]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const header = rows[4] as unknown[]

  // 전년 참조 주차(MM/DD~MM/DD) 컬럼 탐색 — ±3일 근사 매칭
  const currentColIdx = findNearestWeekColumn(header, refDateStr)


  // 카테고리 누적값
  type PlcCatAccum = {
    totalNormSales: number; salesBeforeCurrent: number
    salesAfterCurrent: number; currentWeekSales: number
    estRemainWeeks: number; count: number
    weeklyNormSalesSum: number[]
  }
  const catAccum = new Map<string, PlcCatAccum>()

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

    let salesBeforeCurrent = 0
    for (let j = 0; j <= Math.min(relIdx, weeklyNormSales.length - 1); j++) {
      salesBeforeCurrent += weeklyNormSales[j]
    }
    const salesAfterCurrent = Math.max(0, totalNormSales - salesBeforeCurrent)
    const estRemainWeeks = currentWeekSales > 0
      ? Math.max(1, Math.round(salesAfterCurrent / currentWeekSales))
      : 0

    const plcData: PrevYearPlcData = {
      totalNormSales, salesBeforeCurrent, salesAfterCurrent,
      currentWeekSales, estRemainWeeks, weeklyNormSales,
    }

    // 원본 코드 맵 (후보 리스트 생성용)
    rawMap.set(styleCode, plcData)

    // 1단계 맵
    const suffixKey = getItemSuffixKey(styleCode)
    if (suffixKey) exactMap.set(suffixKey, plcData)

    // 카테고리 누적
    const catKey = getItemCategoryKey(styleCode)
    if (catKey && totalNormSales > 0) {
      const acc = catAccum.get(catKey)
      if (!acc) {
        catAccum.set(catKey, {
          totalNormSales, salesBeforeCurrent, salesAfterCurrent,
          currentWeekSales, estRemainWeeks,
          count: 1,
          weeklyNormSalesSum: [...weeklyNormSales],
        })
      } else {
        acc.totalNormSales      += totalNormSales
        acc.salesBeforeCurrent  += salesBeforeCurrent
        acc.salesAfterCurrent   += salesAfterCurrent
        acc.currentWeekSales    += currentWeekSales
        acc.estRemainWeeks      += estRemainWeeks
        acc.count++
        for (let w = 0; w < weeklyNormSales.length; w++) {
          acc.weeklyNormSalesSum[w] = (acc.weeklyNormSalesSum[w] ?? 0) + weeklyNormSales[w]
        }
      }
    }
  }

  // 2단계 맵: 카테고리 평균
  for (const [catKey, acc] of catAccum) {
    const n = acc.count
    categoryMap.set(catKey, {
      totalNormSales:     Math.round(acc.totalNormSales     / n),
      salesBeforeCurrent: Math.round(acc.salesBeforeCurrent / n),
      salesAfterCurrent:  Math.round(acc.salesAfterCurrent  / n),
      currentWeekSales:   Math.round(acc.currentWeekSales   / n),
      estRemainWeeks:     Math.round(acc.estRemainWeeks      / n),
      weeklyNormSales:    acc.weeklyNormSalesSum.map(v => Math.round(v / n)),
    })
  }

  return { exactMap, categoryMap, rawMap }
}

// ─────────────────────────────────────────────
//  유틸: BI_전년PLC 헤더에서 ±3일 이내 가장 가까운 주차 컬럼 탐색
//  refDateStr: "2025-05-12 - 2025-05-18"
//  헤더 형식: "05/12~05/18"
// ─────────────────────────────────────────────
function findNearestWeekColumn(header: unknown[], refDateStr: string): number {
  const fallback = Math.min(PREV_PLC.weeklyStart + 21, header.length - 1)
  if (!refDateStr) return fallback

  // refDateStr에서 시작일 MM/DD 파싱
  const m = refDateStr.match(/\d{4}-(\d{2})-(\d{2})/)
  if (!m) return fallback
  const targetDoy = mmddToDoy(parseInt(m[1]), parseInt(m[2]))

  let bestCol = fallback
  let bestDist = Infinity

  for (let c = PREV_PLC.weeklyStart; c < header.length; c++) {
    const cell = String(header[c] ?? '').replace(/\s/g, '')
    // "MM/DD~MM/DD" 형식에서 시작 MM/DD 추출
    const hm = cell.match(/^(\d{2})\/(\d{2})~/)
    if (!hm) continue
    const headerDoy = mmddToDoy(parseInt(hm[1]), parseInt(hm[2]))
    const dist = Math.abs(headerDoy - targetDoy)
    if (dist < bestDist) {
      bestDist = dist
      bestCol = c
      if (dist === 0) break   // 정확히 일치
    }
  }

  // 7일(1주) 이상 차이나면 중간값 폴백 (데이터 이상)
  return bestDist <= 7 ? bestCol : fallback
}

/** 월/일 → 연중 일수 (윤년 무시, 비교용) */
function mmddToDoy(month: number, day: number): number {
  const daysInMonth = [0,31,28,31,30,31,30,31,31,30,31,30,31]
  let doy = day
  for (let i = 1; i < month; i++) doy += daysInMonth[i]
  return doy
}

// ─────────────────────────────────────────────
//  유틸: BI_스타일별전년 시트의 참조 주차 문자열 읽기
//  행1, col2 = "2025-05-12 - 2025-05-18"
// ─────────────────────────────────────────────
function readPrevYearRefDate(wb: XLSX.WorkBook): string {
  const sheetName = wb.SheetNames.find(n =>
    n.replace(/[_\s]/g, '').toLowerCase().includes('스타일별전년') ||
    n.replace(/[_\s]/g, '').toLowerCase().includes('스타일전년')
  )
  if (!sheetName) return ''
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' })
  return String((rows[1] as unknown[])?.[2] ?? '')
}

// ─────────────────────────────────────────────
//  전년 상품 후보 리스트 생성
//  rawStyleMap + rawPlcMap 을 결합해 PrevYearStyleCandidate[] 반환
// ─────────────────────────────────────────────
function buildPrevYearCandidateList(
  rawStyleMap: Map<string, PrevYearStyleData>,
  rawPlcMap:   Map<string, PrevYearPlcData>,
): PrevYearStyleCandidate[] {
  const candidates: PrevYearStyleCandidate[] = []

  for (const [styleCode, styleData] of rawStyleMap) {
    if (!styleData.styleName) continue   // 상품명 없는 행 제외

    // PLC 데이터는 없어도 후보로 등록 (weeklyNormSales 빈 배열)
    const plcData = rawPlcMap.get(styleCode) ?? {
      totalNormSales: 0, salesBeforeCurrent: 0, salesAfterCurrent: 0,
      currentWeekSales: 0, estRemainWeeks: 0, weeklyNormSales: [],
    }

    candidates.push({
      styleCode,
      styleName:        styleData.styleName,
      weekNormSalesQty: styleData.weekNormSalesQty,
      cumSalesRate:     styleData.cumSalesRate,
      estRemainWeeks:   plcData.estRemainWeeks,
      weeklyNormSales:  plcData.weeklyNormSales,
      prevYearData: {
        style: styleData,
        plc:   plcData,
      },
    })
  }

  return candidates
}

// ─────────────────────────────────────────────
//  유틸: refDateStr → "MM/DD~MM/DD" 변환 (월/일만 사용)
//  "2025-05-12 - 2025-05-18" → "05/12~05/18"
// ─────────────────────────────────────────────
function refDateStrToWeekKey(refDateStr: string): string | null {
  const m = refDateStr.match(/(\d{4})-(\d{2})-(\d{2})\s*-\s*\d{4}-(\d{2})-(\d{2})/)
  if (!m) return null
  return `${m[2]}/${m[3]}~${m[4]}/${m[5]}`
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
    return { styles: [], errors: ['유효한 시트를 찾을 수 없습니다.'], sheetName: '', prevYearCandidates: [], styleNameMap: {} }
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
        store_expansion: 'expand',
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
  return { styles: Array.from(styleMap.values()), errors, sheetName: targetSheet, prevYearCandidates: [], styleNameMap: {} }
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
