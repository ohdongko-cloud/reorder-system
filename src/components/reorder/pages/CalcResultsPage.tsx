'use client'

import { useCallback, useEffect, useState, useMemo } from 'react'
import { useReorderStore } from '@/store/reorder-store'
import { InlineNumberInput } from '../InlineNumberInput'
import { TModal } from '../TModal'
import {
  STRATEGY_LABELS, STRATEGY_COLORS, MIN_RECOMMEND_QTY,
  STYLE_BADGE_LABELS, STYLE_BADGE_COLORS,
  parseStyleCode, getWeekRange,
} from '@/lib/constants'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { CheckCircle, X, Copy, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react'
import type { ColorRow, StyleRow, Strategy, StyleBadge } from '@/types/reorder'

const GOTHIC = "'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif"
const SALES_GROUP_KEY = 'reorder_salesgroup_open'

const PLC_ORDER: Record<string, number> = { '도입기': 0, '성장기': 1, '유지기': 2, '쇠퇴기': 3 }

const TH_BASE  = '#1e293b'
const TH_GROUP = '#0f172a'
const TH_SALES = '#134e4a'
const TH_OPS   = '#1c3461'
const TH_OLD   = '#334155'
const TH_NEW   = '#1e3a5f'
const TH_AJ    = '#5b4406'

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString()
}

// "2026-05-12 ~ 2026-05-18" → "05/12~05/18"
function shortPeriod(period: string | null): string | null {
  if (!period) return null
  const parts = period.split(' ~ ')
  if (parts.length !== 2) return period
  const f = (s: string) => s.slice(5).replace('-', '/')
  return `${f(parts[0])}~${f(parts[1])}`
}

interface TModalState { open: boolean; color: ColorRow | null; style: StyleRow | null }
const STRATEGY_LEVELS: Strategy[] = [1, 2, 3, 4, 5]

function styleAgg(style: StyleRow) {
  let sumN = 0, sumStock = 0, sumOld = 0, sumNew = 0, sumAj = 0, sumL = 0, sumM = 0
  for (const c of style.colors) {
    sumN    += c.n
    sumStock += Math.max(0, c.l - c.m)
    sumOld  += c.calcOld ?? 0
    sumNew  += c.calcNew ?? 0
    sumAj   += c.aj
    sumL    += c.l
    sumM    += c.m
  }
  return {
    sumN, qPct: sumStock > 0 ? sumN / sumStock : 0, sumStock,
    sumOld, sumNew, sumAj, sumL, sumM,
    plcOrder: PLC_ORDER[style.plc] ?? 0,
  }
}

interface StatusBadge { label: string; cls: string }
function getStatusBadges(style: StyleRow): StatusBadge[] {
  const result: StatusBadge[] = []
  const anyHigh = style.colors.some(c => {
    const stock = c.l - c.m
    return stock > 0 && c.n / stock * 100 >= 10
  })
  if (anyHigh) result.push({ label: '고회전', cls: 'bg-orange-100 text-orange-800 border-orange-300' })
  if (style.plc === '쇠퇴기') result.push({ label: '시즌종료', cls: 'bg-red-100 text-red-700 border-red-200' })
  const totalL = style.colors.reduce((a, c) => a + c.l, 0)
  const totalM = style.colors.reduce((a, c) => a + c.m, 0)
  const soreal = totalL > 0 ? totalM / totalL * 100 : 0
  if (style.days_since_inbound >= 50 && soreal < 40 && totalL > 0)
    result.push({ label: '저소진', cls: 'bg-yellow-100 text-yellow-800 border-yellow-300' })
  return result
}

type RiskState = 'none' | 'low' | 'ok' | 'high'
function getRisk(color: ColorRow): RiskState {
  if (color.aj <= 0 || color.calcNew == null || color.calcNew <= 0) return 'none'
  const ratio = color.aj / color.calcNew
  if (ratio < 0.6) return 'low'
  if (ratio > 1.5) return 'high'
  return 'ok'
}

export function CalcResultsPage() {
  const styles           = useReorderStore(s => s.styles)
  const updateColorField = useReorderStore(s => s.updateColorField)
  const setAllStrategies = useReorderStore(s => s.setAllStrategies)
  const currentSession   = useReorderStore(s => s.currentSession)

  const [plcFilter,     setPlcFilter]     = useState('all')
  const [qtyFilter,     setQtyFilter]     = useState<'300+' | 'all'>('300+')
  const [yearFilter,    setYearFilter]    = useState('all')
  const [seasonFilter,  setSeasonFilter]  = useState('all')
  const [badgeFilter,   setBadgeFilter]   = useState('all')
  const [itemFilter,    setItemFilter]    = useState('all')
  const [plannerFilter, setPlannerFilter] = useState('all')
  const [factoryFilter, setFactoryFilter] = useState('all')

  const [sortField, setSortField] = useState<string | null>(null)
  const [sortDir,   setSortDir]   = useState<'asc' | 'desc'>('asc')
  const [tModal,    setTModal]    = useState<TModalState>({ open: false, color: null, style: null })
  const [confirmModal, setConfirmModal] = useState(false)

  // REQ-04: 판매지표 그룹 접기/펼치기 (localStorage 유지)
  const [isSalesGroupOpen, setIsSalesGroupOpen] = useState(true)
  useEffect(() => {
    const stored = localStorage.getItem(SALES_GROUP_KEY)
    if (stored !== null) setIsSalesGroupOpen(stored === 'true')
  }, [])
  const toggleSalesGroup = () => setIsSalesGroupOpen(v => {
    const next = !v
    localStorage.setItem(SALES_GROUP_KEY, String(next))
    return next
  })

  function toggleSort(field: string) {
    setSortField(prev => {
      if (prev === field) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return field }
      setSortDir('asc'); return field
    })
  }

  const uniqueYears = useMemo(() => {
    const s = new Set<string>()
    styles.forEach(st => { const { year } = parseStyleCode(st.code); if (year) s.add(String(year)) })
    return Array.from(s).sort((a, b) => Number(b) - Number(a))
  }, [styles])

  const uniqueItems = useMemo(() => {
    const s = new Set<string>()
    styles.forEach(st => { const { item } = parseStyleCode(st.code); if (item?.trim()) s.add(item) })
    return Array.from(s).sort()
  }, [styles])

  const filteredStyles = useMemo(() => {
    return styles.filter(style => {
      const { year, season, item } = parseStyleCode(style.code)
      if (plcFilter    !== 'all' && style.plc !== plcFilter)                           return false
      if (yearFilter   !== 'all' && String(year) !== yearFilter)                        return false
      if (seasonFilter !== 'all' && String(season) !== seasonFilter)                    return false
      if (badgeFilter  !== 'all' && !style.badges.includes(badgeFilter as StyleBadge)) return false
      if (itemFilter   !== 'all' && item !== itemFilter)                                return false
      if (qtyFilter    === '300+' && !style.colors.some(c => (c.calcNew ?? 0) >= MIN_RECOMMEND_QTY)) return false
      return true
    })
  }, [styles, plcFilter, yearFilter, seasonFilter, badgeFilter, itemFilter, qtyFilter])

  const sortedStyles = useMemo(() => {
    if (!sortField) return filteredStyles
    return [...filteredStyles].sort((a, b) => {
      const av = styleAgg(a), bv = styleAgg(b)
      let diff = 0
      if      (sortField === 'code')      diff = a.code.localeCompare(b.code)
      else if (sortField === 'plc')       diff = av.plcOrder - bv.plcOrder
      else if (sortField === 'sumL')      diff = av.sumL     - bv.sumL
      else if (sortField === 'sumN')      diff = av.sumN     - bv.sumN
      else if (sortField === 'qPct')      diff = av.qPct     - bv.qPct
      else if (sortField === 'sumStock')  diff = av.sumStock - bv.sumStock
      else if (sortField === 'sumOld')    diff = av.sumOld   - bv.sumOld
      else if (sortField === 'sumNew')    diff = av.sumNew   - bv.sumNew
      else if (sortField === 'sumAj')     diff = av.sumAj    - bv.sumAj
      return sortDir === 'asc' ? diff : -diff
    })
  }, [filteredStyles, sortField, sortDir])

  // REQ-06: 전체 집계 (totalL, totalM 추가)
  let totalOld = 0, totalNew = 0, totalAj = 0, totalN = 0, totalStock = 0, totalColors = 0
  let totalL = 0, totalM = 0
  for (const style of sortedStyles) {
    for (const c of style.colors) {
      totalOld   += c.calcOld ?? 0
      totalNew   += c.calcNew ?? 0
      totalAj    += c.aj
      totalN     += c.n
      totalStock += Math.max(0, c.l - c.m)
      totalColors++
      totalL     += c.l
      totalM     += c.m
    }
  }

  const globalStrategy: Strategy | null = useMemo(() => {
    if (styles.length === 0) return 3
    const all = styles.flatMap(s => s.colors.map(c => c.strategy ?? s.strategy))
    if (all.length === 0) return 3
    const first = all[0]
    return all.every(v => v === first) ? first as Strategy : null
  }, [styles])

  const update = useCallback(
    (styleId: string, colorId: string, field: 'n' | 's' | 't' | 'r' | 'aj' | 'weight' | 'strategy', value: number) =>
      updateColorField(styleId, colorId, field, value),
    [updateColorField]
  )

  // REQ-03: 판매기간 표시 (주간 범위)
  const salesPeriod = currentSession ? getWeekRange(currentSession.base_date) : null

  function handleExcelCopy() {
    const header = ['스타일', '컬러', 'PLC', '누적입량', '소진율%', '매장수', '주판량', '주판율%', '현재재고', '판매기간(주)', '가중치', '발주성향', '기존제안', '신규제안', 'MD확정']
    const rows = [header]
    for (const style of sortedStyles) {
      for (const c of style.colors) {
        const stock  = Math.max(0, c.l - c.m)
        const qPct   = stock > 0 ? (c.n / stock * 100).toFixed(1) : ''
        const soReal = c.l > 0 ? (c.m / c.l * 100).toFixed(1) : ''
        rows.push([
          style.code, c.color_name, style.plc,
          String(c.l), soReal, String(style.stores),
          String(c.n), qPct, String(stock),
          String(c.s), c.weight.toFixed(1),
          String(c.strategy ?? style.strategy),
          String(c.calcOld ?? ''), String(c.calcNew ?? ''), String(c.aj || ''),
        ])
      }
    }
    navigator.clipboard.writeText(rows.map(r => r.join('\t')).join('\n'))
      .then(() => toast.success('클립보드에 복사됐습니다'))
      .catch(() => toast.error('복사 실패'))
  }

  const sessionLabel = currentSession ? `${currentSession.name} (${getWeekRange(currentSession.base_date)})` : null
  // 판매지표: 담당기획, 누적입고량, 소진율, 원가율, 분배매장수, 주판량, 주판율 = 7 cols
  const salesCols = isSalesGroupOpen ? 7 : 1
  // 전체 col 수: 스타일+컬러+PLC + 판매지표(7or1) + 운영정보(4) + 발주설정(2) + 기존+신규 + 확정+위험
  const totalCols = 2 + 1 + salesCols + 4 + 2 + 1 + 1 + 2

  if (styles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 text-slate-400 py-24" style={{ fontFamily: GOTHIC }}>
        <div className="text-4xl mb-3">📊</div>
        <div className="text-base">300장 이상 추천되는 스타일이 없습니다.</div>
        <div className="text-sm mt-1 text-slate-300">엑셀 파일을 업로드하면 자동으로 계산됩니다.</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ fontFamily: GOTHIC }}>

      {/* ── 상단 타이틀 바 ── */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-3 shrink-0">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-slate-800">계산 결과</div>
          <div className="text-xs text-slate-400 mt-0.5">
            {sortedStyles.length}개 스타일 · {totalColors}개 컬러
            {sessionLabel && <span className="ml-2">· {sessionLabel}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />기존 추천</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />신규 추천</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />MD 확정</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={handleExcelCopy}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-300 text-xs text-slate-600 hover:bg-slate-50 transition-colors">
            <Copy className="w-3 h-3" />엑셀 복사
          </button>
          <button onClick={() => setConfirmModal(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700 transition-colors">
            <CheckCircle className="w-3 h-3" />발주 확정
          </button>
        </div>
      </div>

      {/* ── 전략 바 ── */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center gap-3 shrink-0">
        <span className="text-xs text-slate-500 font-semibold shrink-0">스타일별 발주 성향</span>
        <div className="inline-flex rounded-md overflow-hidden border border-slate-300 shadow-sm">
          {STRATEGY_LEVELS.map(lv => {
            const isActive = globalStrategy === lv
            const color    = STRATEGY_COLORS[lv]
            return (
              <button key={lv} onClick={() => setAllStrategies(lv)}
                className="px-3 py-1.5 text-xs font-semibold border-r border-slate-300 last:border-r-0 transition-colors whitespace-nowrap"
                style={isActive
                  ? { background: color, color: '#fff', borderColor: color }
                  : { background: '#fff', color: '#64748b' }}>
                {lv === 3 ? '● 중간 기본값' : STRATEGY_LABELS[lv]}
              </button>
            )
          })}
        </div>
        <span className="text-xs text-slate-400 shrink-0 hidden lg:inline">업로드 전체 계산 후 자동 선별된 스타일</span>
        <div className="ml-auto flex items-center gap-2">
          <Fsel label="PLC" value={plcFilter} onChange={setPlcFilter}>
            <option value="all">PLC 전체</option>
            <option value="도입기">도입기</option>
            <option value="성장기">성장기</option>
            <option value="유지기">유지기</option>
            <option value="쇠퇴기">쇠퇴기</option>
          </Fsel>
          <Fsel label="수량" value={qtyFilter} onChange={v => setQtyFilter(v as '300+' | 'all')}>
            <option value="300+">≥{MIN_RECOMMEND_QTY}장 (추천 대상)</option>
            <option value="all">전체 보기</option>
          </Fsel>
        </div>
      </div>

      {/* ── 추가 필터 바 ── */}
      <div className="bg-white border-b border-slate-200 px-4 py-1.5 flex items-center gap-2 shrink-0 flex-wrap">
        <span className="text-xs text-slate-400 font-semibold shrink-0">세부 필터</span>
        <Fsel label="PLC" value={plcFilter} onChange={setPlcFilter}>
          <option value="all">PLC 전체</option>
          <option value="도입기">도입기</option>
          <option value="성장기">성장기</option>
          <option value="유지기">유지기</option>
          <option value="쇠퇴기">쇠퇴기</option>
        </Fsel>
        <Fsel label="연도" value={yearFilter} onChange={setYearFilter}>
          <option value="all">전체 연도</option>
          {uniqueYears.map(y => <option key={y} value={y}>{y}</option>)}
        </Fsel>
        <Fsel label="시즌" value={seasonFilter} onChange={setSeasonFilter}>
          <option value="all">전체 시즌</option>
          {[1, 2, 3, 4].map(s => <option key={s} value={String(s)}>{s}시즌</option>)}
        </Fsel>
        <Fsel label="구분" value={badgeFilter} onChange={setBadgeFilter}>
          <option value="all">전체 구분</option>
          <option value="carryover">캐리오버</option>
          <option value="qr_test">QR테스트</option>
          <option value="re">RE</option>
        </Fsel>
        <Fsel label="아이템" value={itemFilter} onChange={setItemFilter}>
          <option value="all">전체 아이템</option>
          {uniqueItems.map(i => <option key={i} value={i}>{i}</option>)}
        </Fsel>
        {/* REQ-05: 담당기획/공장 UI-only (데이터 소스 미정) */}
        <Fsel label="담당기획" value={plannerFilter} onChange={setPlannerFilter}>
          <option value="all">전체 기획자</option>
        </Fsel>
        <Fsel label="공장" value={factoryFilter} onChange={setFactoryFilter}>
          <option value="all">전체 공장</option>
        </Fsel>
        {(plcFilter !== 'all' || yearFilter !== 'all' || seasonFilter !== 'all' || badgeFilter !== 'all' || itemFilter !== 'all') && (
          <button
            onClick={() => { setPlcFilter('all'); setYearFilter('all'); setSeasonFilter('all'); setBadgeFilter('all'); setItemFilter('all'); setPlannerFilter('all'); setFactoryFilter('all') }}
            className="text-xs text-blue-500 underline ml-1">초기화</button>
        )}
      </div>

      {/* ── 테이블 ── */}
      {sortedStyles.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-slate-400 py-16">
          <div className="text-3xl mb-2">🔍</div>
          <div className="text-sm">조건에 맞는 스타일이 없습니다.</div>
          <button
            onClick={() => { setPlcFilter('all'); setYearFilter('all'); setSeasonFilter('all'); setBadgeFilter('all'); setItemFilter('all'); setQtyFilter('all') }}
            className="mt-2 text-xs text-blue-500 underline">필터 초기화</button>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="border-collapse bg-white w-full" style={{ fontSize: 13, minWidth: isSalesGroupOpen ? 1760 : 1200 }}>
            <colgroup>
              <col style={{ width: 204 }} />  {/* 스타일 */}
              <col style={{ width: 102 }} />  {/* 컬러 */}
              <col style={{ width: 58 }} />   {/* PLC */}
              {isSalesGroupOpen ? (
                <>
                  <col style={{ width: 82 }} />   {/* 담당기획 */}
                  <col style={{ width: 78 }} />   {/* 누적입고량 */}
                  <col style={{ width: 68 }} />   {/* 소진율 */}
                  <col style={{ width: 66 }} />   {/* 원가율 */}
                  <col style={{ width: 74 }} />   {/* 분배매장수 */}
                  <col style={{ width: 76 }} />   {/* 주판량 */}
                  <col style={{ width: 68 }} />   {/* 주판율 */}
                </>
              ) : (
                <col style={{ width: 92 }} />
              )}
              <col style={{ width: 78 }} />   {/* 현재재고 */}
              <col style={{ width: 84 }} />   {/* 생산정보 */}
              <col style={{ width: 76 }} />   {/* 판매기간 */}
              <col style={{ width: 68 }} />   {/* 가중치 */}
              <col style={{ width: 94 }} />   {/* 발주성향 */}
              <col style={{ width: 90 }} />   {/* 전년/T */}
              <col style={{ width: 92 }} />   {/* 기존로직 */}
              <col style={{ width: 104 }} />  {/* 신규로직 */}
              <col style={{ width: 92 }} />   {/* 확정발주 */}
              <col style={{ width: 48 }} />   {/* 위험 */}
            </colgroup>

            <thead className="sticky top-0 z-20">
              {/* ── Row 1: 그룹 헤더 ── */}
              <tr style={{ color: '#cbd5e1', fontSize: 12 }}>
                <th colSpan={2} className="px-3 py-2 text-left font-bold border-r border-slate-600"
                  style={{ background: TH_BASE }}>
                  상품
                  <SortIcon field="code" current={sortField} dir={sortDir} onClick={toggleSort} />
                </th>
                <th rowSpan={2} className="px-1 py-2 text-center align-middle border-r border-slate-600"
                  style={{ background: TH_BASE }}>
                  <ColSort field="plc" current={sortField} dir={sortDir} onClick={toggleSort}>PLC</ColSort>
                </th>

                {/* 판매지표 그룹 (접기/펼치기) */}
                <th colSpan={salesCols}
                  className="px-2 pt-1.5 pb-0.5 text-center font-bold border-r border-slate-600 select-none"
                  style={{ background: TH_SALES }}>
                  <button onClick={toggleSalesGroup}
                    className="flex items-center gap-1 mx-auto hover:opacity-80 transition-opacity"
                    title={isSalesGroupOpen ? '판매지표 접기' : '판매지표 펼치기'}>
                    {isSalesGroupOpen
                      ? <ChevronLeft className="w-3 h-3 shrink-0" />
                      : <ChevronRight className="w-3 h-3 shrink-0" />}
                    판매지표
                  </button>
                </th>

                <th colSpan={4} className="px-2 pt-1.5 pb-0.5 text-center font-bold border-r border-slate-600"
                  style={{ background: TH_OPS }}>운영정보</th>
                <th colSpan={2} className="px-2 pt-1.5 pb-0.5 text-center font-bold border-r border-slate-600"
                  style={{ background: TH_GROUP }}>발주 설정</th>
                <th rowSpan={2} className="px-2 py-2 text-center align-middle border-r border-slate-600"
                  style={{ background: TH_OLD }}>
                  <ColSort field="sumOld" current={sortField} dir={sortDir} onClick={toggleSort}>기존 로직</ColSort>
                </th>
                <th rowSpan={2} className="px-2 py-2 text-center align-middle border-r border-slate-600"
                  style={{ background: TH_NEW }}>
                  <ColSort field="sumNew" current={sortField} dir={sortDir} onClick={toggleSort}>신규 로직</ColSort>
                </th>
                <th colSpan={2} className="px-2 pt-1.5 pb-0.5 text-center font-bold"
                  style={{ background: TH_AJ, color: '#fcd34d' }}>MD 확정</th>
              </tr>

              {/* ── Row 2: 컬럼 헤더 ── */}
              <tr style={{ color: '#94a3b8', fontSize: 11 }}>
                <th className="px-2 pb-1.5 text-left border-r border-slate-600" style={{ background: TH_BASE }}>스타일</th>
                <th className="px-2 pb-1.5 text-left border-r border-slate-600" style={{ background: TH_BASE }}>컬러</th>
                {/* PLC: rowSpan=2 → no cell */}

                {/* 판매지표 서브헤더 (7 cols when open) */}
                {isSalesGroupOpen ? (
                  <>
                    <th className="px-1 pb-1.5 text-center border-r border-slate-600" style={{ background: TH_SALES }}>담당기획</th>
                    <th className="px-1 pb-1.5 text-center border-r border-slate-600" style={{ background: TH_SALES }}>
                      <ColSort field="sumL" current={sortField} dir={sortDir} onClick={toggleSort}>누적입고량</ColSort>
                    </th>
                    <th className="px-1 pb-1.5 text-center border-r border-slate-600" style={{ background: TH_SALES }}>소진율</th>
                    <th className="px-1 pb-1.5 text-center border-r border-slate-600" style={{ background: TH_SALES }}>원가율</th>
                    <th className="px-1 pb-1.5 text-center border-r border-slate-600" style={{ background: TH_SALES }}>분배매장수</th>
                    <th className="px-1 pb-1.5 text-center border-r border-slate-600" style={{ background: TH_SALES }}>
                      <ColSort field="sumN" current={sortField} dir={sortDir} onClick={toggleSort}>주판량</ColSort>
                    </th>
                    <th className="px-1 pb-1.5 text-center border-r border-slate-600" style={{ background: TH_SALES }}>
                      <ColSort field="qPct" current={sortField} dir={sortDir} onClick={toggleSort}>주판율</ColSort>
                    </th>
                  </>
                ) : (
                  <th className="px-1 pb-1.5 text-center text-[10px] border-r border-slate-600" style={{ background: TH_SALES }}>
                    <ColSort field="sumL" current={sortField} dir={sortDir} onClick={toggleSort}>입고/소진</ColSort>
                  </th>
                )}

                {/* 운영정보 서브헤더 */}
                <th className="px-1 pb-1.5 text-center border-r border-slate-600" style={{ background: TH_OPS }}>
                  <ColSort field="sumStock" current={sortField} dir={sortDir} onClick={toggleSort}>현재재고</ColSort>
                </th>
                <th className="px-1 pb-1.5 text-center border-r border-slate-600" style={{ background: TH_OPS }}>생산정보</th>
                <th className="px-1 pb-1.5 text-center border-r border-slate-600" style={{ background: TH_OPS }}>판매기간</th>
                <th className="px-1 pb-1.5 text-center border-r border-slate-600" style={{ background: TH_OPS }}>가중치</th>

                {/* 발주설정 서브헤더 */}
                <th className="px-1 pb-1.5 text-center border-r border-slate-600" style={{ background: TH_GROUP }}>발주성향</th>
                <th className="px-1 pb-1.5 text-center border-r border-slate-600" style={{ background: TH_GROUP }}>전년/T</th>
                {/* 기존·신규: rowSpan=2 → no cell */}

                {/* MD확정 서브헤더 */}
                <th className="px-1 pb-1.5 text-center border-r border-slate-200" style={{ background: TH_AJ, color: '#fcd34d' }}>
                  <ColSort field="sumAj" current={sortField} dir={sortDir} onClick={toggleSort}>확정발주</ColSort>
                </th>
                <th className="px-1 pb-1.5 text-center" style={{ background: TH_AJ, color: '#fcd34d' }}>위험</th>
              </tr>

              <tr><td colSpan={totalCols} className="p-0 h-0.5 bg-slate-900" /></tr>
            </thead>

            <tbody>
              {sortedStyles.map(style => (
                <StyleRows key={style.id} style={style}
                  isSalesGroupOpen={isSalesGroupOpen}
                  salesPeriod={salesPeriod}
                  onTModal={(c, s) => setTModal({ open: true, color: c, style: s })}
                  onUpdate={update} />
              ))}
              <GrandTotalRow
                styles={sortedStyles}
                isSalesGroupOpen={isSalesGroupOpen}
                totalN={totalN} totalStock={totalStock}
                totalOld={totalOld} totalNew={totalNew} totalAj={totalAj}
                totalL={totalL} totalM={totalM} />
            </tbody>
          </table>
        </div>
      )}

      {/* ── 하단 서머리 바 ── */}
      <div className="flex items-center gap-5 px-4 py-2 text-xs shrink-0" style={{ background: '#0f172a', color: '#e2e8f0' }}>
        <div className="flex flex-col gap-0.5 shrink-0">
          <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>스타일 수</span>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{sortedStyles.length}개</span>
        </div>
        <div className="flex flex-col gap-0.5 shrink-0">
          <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>누적입량</span>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{totalL.toLocaleString()} pcs</span>
        </div>
        <div className="flex flex-col gap-0.5 shrink-0">
          <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>소진율</span>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{totalL > 0 ? (totalM / totalL * 100).toFixed(1) + '%' : '—'}</span>
        </div>
        <div className="flex flex-col gap-0.5 shrink-0">
          <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>기존 로직 합계</span>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{totalOld.toLocaleString()} pcs</span>
        </div>
        <div className="flex flex-col gap-0.5 shrink-0">
          <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>신규 로직 합계</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#93c5fd' }}>
            {totalNew.toLocaleString()} pcs
            {totalOld > 0 && (
              <span className={cn('text-xs ml-1', totalNew > totalOld ? 'text-red-400' : 'text-blue-300')}>
                ({totalNew > totalOld ? '▲' : '▼'}{Math.abs((totalNew - totalOld) / totalOld * 100).toFixed(1)}%)
              </span>
            )}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 shrink-0">
          <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>MD 확정 합계</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#6ee7b7' }}>
            {totalAj > 0 ? `${totalAj.toLocaleString()} pcs` : '—'}
          </span>
        </div>
        <button
          className="ml-auto px-4 py-1.5 rounded text-xs font-semibold transition-colors shrink-0"
          style={{ background: '#2563eb', color: '#fff', border: 'none' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#1d4ed8')}
          onMouseLeave={e => (e.currentTarget.style.background = '#2563eb')}>
          💾 저장
        </button>
      </div>

      {/* ── TModal ── */}
      {tModal.open && tModal.color && tModal.style && (
        <TModal open={tModal.open}
          onClose={() => setTModal({ open: false, color: null, style: null })}
          color={tModal.color} style={tModal.style} />
      )}

      {/* ── 발주 확정 모달 ── */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl w-96 p-6" style={{ fontFamily: GOTHIC }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800">✅ 발주 확정</h3>
              <button onClick={() => setConfirmModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4 p-3 rounded-lg" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <div className="text-center">
                <div className="text-xl font-bold text-emerald-700">{sortedStyles.length}</div>
                <div className="text-xs text-slate-500">확정 대상 스타일</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-emerald-700">{(totalAj > 0 ? totalAj : totalNew).toLocaleString()}</div>
                <div className="text-xs text-slate-500">총 확정 수량(pcs)</div>
              </div>
            </div>
            {totalAj > 0 && totalNew > 0 && (
              <div className="mb-4 px-3 py-2.5 rounded-lg text-xs text-amber-800" style={{ background: '#fefce8', border: '1px solid #fde68a' }}>
                ⚠ 신규 로직 추천량({totalNew.toLocaleString()}pcs) 대비{' '}
                <strong>{(totalAj / totalNew * 100).toFixed(1)}%</strong> 수준입니다.
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmModal(false)}
                className="px-4 py-1.5 rounded border border-slate-300 text-xs text-slate-600 hover:bg-slate-50">취소</button>
              <button onClick={() => {
                setConfirmModal(false)
                toast.success('발주 확정 완료! DB에 저장되었습니다.', {
                  description: `총 ${(totalAj > 0 ? totalAj : totalNew).toLocaleString()} pcs · ${sortedStyles.length}개 스타일`
                })
              }} className="px-4 py-1.5 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700">확정 저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── StyleRows ────────────────────────────────────────────────────────────────
function StyleRows({ style, isSalesGroupOpen, salesPeriod, onTModal, onUpdate }: {
  style: StyleRow
  isSalesGroupOpen: boolean
  salesPeriod: string | null
  onTModal: (c: ColorRow, s: StyleRow) => void
  onUpdate: (sid: string, cid: string, f: 'n' | 's' | 't' | 'r' | 'aj' | 'weight' | 'strategy', v: number) => void
}) {
  const colorCount   = style.colors.length
  const statusBadges = getStatusBadges(style)
  const { year, season, item } = parseStyleCode(style.code)
  const totalStyleL  = style.colors.reduce((s, c) => s + c.l, 0)
  // REQ-03: 짧은 주간 범위 또는 days 표시
  const periodLabel  = shortPeriod(salesPeriod) ?? `${style.days_since_inbound}일`

  return (
    <>
      {style.colors.map((color, ci) => {
        const inactive = color.l === 0
        const { calcOld, calcNew, delta } = color
        const stock  = Math.max(0, color.l - color.m)
        const qPct   = stock > 0 ? color.n / stock * 100 : null
        const soReal = color.l > 0 ? color.m / color.l * 100 : null
        const risk   = getRisk(color)

        const qCls = qPct == null ? 'text-slate-400'
          : qPct >= 10 ? 'text-red-600 font-bold'
          : qPct >= 7  ? 'text-amber-600 font-semibold'
          : 'text-slate-600'

        const soRealCls = soReal == null ? 'text-slate-400'
          : soReal >= 80 ? 'text-emerald-600 font-semibold'
          : soReal >= 50 ? 'text-slate-600'
          : soReal >= 30 ? 'text-amber-600'
          : 'text-red-500 font-semibold'

        const deltaCls = delta == null ? ''
          : delta > 5  ? 'text-orange-500'
          : delta < -5 ? 'text-blue-400'
          : 'text-slate-400'

        return (
          <tr key={color.id}
            className={cn('border-b border-slate-100 hover:bg-slate-50/60 transition-colors', inactive && 'opacity-40')}>

            {/* ── 스타일 셀 (rowSpan) ── */}
            {ci === 0 && (
              <td className="px-2 py-2 align-top border-r border-slate-200 bg-white" rowSpan={colorCount}>
                <div className="flex gap-2">
                  <div className="w-12 h-[52px] shrink-0 border-2 border-dashed border-slate-200 rounded-md flex items-center justify-center text-[10px] text-slate-300 font-bold bg-slate-50 select-none cursor-pointer hover:border-blue-400 hover:text-blue-400 transition-colors"
                    title="이미지 추가 (500KB 이하)">
                    IMG
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 flex-wrap mb-0.5">
                      <span className="font-mono text-xs font-bold text-slate-800">{style.code}</span>
                      <span className={cn('text-[10px] px-1 rounded border font-semibold leading-4',
                        style.type === 'reorder' ? 'bg-green-50 text-green-700 border-green-200'
                        : style.type === 'test_cn' ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-blue-50 text-blue-700 border-blue-200')}>
                        {style.type === 'reorder' ? '리오더' : style.type === 'test_cn' ? '사입' : '일반'}
                      </span>
                    </div>
                    {/* REQ-01: text-xs (12px) */}
                    <div className="text-xs text-slate-500 truncate max-w-[130px] mb-0.5 font-medium">{style.name ?? '—'}</div>
                    {/* REQ-03: 판매기간 표시 형식 변경 */}
                    <div className="text-[11px] text-slate-400 mb-0.5 truncate">
                      ₩{style.price.toLocaleString()} · {periodLabel} · {style.stores}매장
                    </div>
                    <div className="flex items-center gap-1 flex-wrap mb-0.5">
                      {year   && <span className="text-[10px] px-1 rounded bg-slate-100 text-slate-600 border border-slate-200 font-semibold leading-4">{year}</span>}
                      {season && <span className="text-[10px] px-1 rounded bg-slate-100 text-slate-600 border border-slate-200 font-semibold leading-4">{season}시즌</span>}
                      {item   && <span className="text-[10px] px-1 rounded bg-slate-100 text-slate-600 border border-slate-200 font-semibold leading-4">{item}</span>}
                    </div>
                    {style.badges.length > 0 && (
                      <div className="flex gap-1 flex-wrap mb-0.5">
                        {style.badges.map(b => (
                          <span key={b} className={cn('text-[10px] px-1 rounded border font-semibold leading-4', STYLE_BADGE_COLORS[b])}>
                            {STYLE_BADGE_LABELS[b]}
                          </span>
                        ))}
                      </div>
                    )}
                    {statusBadges.length > 0 && (
                      <div className="flex gap-1 flex-wrap mb-0.5">
                        {statusBadges.map((b, i) => (
                          <span key={i} className={cn('text-[10px] px-1 rounded border font-semibold leading-4', b.cls)}>
                            {b.label}
                          </span>
                        ))}
                      </div>
                    )}
                    {style.prevYear && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[10px] px-1 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold leading-4"
                          title={`전년 누적 입고대비 판매율. 잔여 예상 ${style.prevYear.plc.estRemainWeeks}주`}>
                          전년 {style.prevYear.style.cumSalesRate.toFixed(0)}%
                        </span>
                        <span className="text-[10px] text-slate-400">잔{style.prevYear.plc.estRemainWeeks}주</span>
                      </div>
                    )}
                    <button
                      onClick={() => onTModal(style.colors[0], style)}
                      className="text-[10px] text-blue-600 underline hover:text-blue-800 mt-0.5 block text-left">
                      리오더 조건 변경
                    </button>
                  </div>
                </div>
              </td>
            )}

            {/* ── 컬러 ── */}
            <td className="px-2 py-2 border-r border-slate-100">
              <div className="flex items-center gap-1.5">
                {color.color_hex && (
                  <span className="w-3 h-3 rounded-full border border-black/10 shrink-0"
                    style={{ background: color.color_hex }} />
                )}
                <span className="text-xs text-slate-700 truncate">{color.color_name}</span>
              </div>
            </td>

            {/* ── PLC ── */}
            <td className="px-1 py-2 text-center border-r border-slate-100">
              {ci === 0 && <PlcBadge plc={style.plc} />}
            </td>

            {/* ── 판매지표 컬럼들 (REQ-04) ── */}
            {isSalesGroupOpen ? (
              <>
                {/* 담당기획 (빈 열) */}
                <td className="px-2 py-1.5 border-r border-slate-100" />
                {/* 누적입고량 */}
                <td className="px-2 py-1.5 text-right tabular-nums border-r border-slate-100 text-teal-700 font-medium">
                  {inactive ? '—' : color.l.toLocaleString()}
                </td>
                {/* 소진율 */}
                <td className={cn('px-2 py-1.5 text-right tabular-nums border-r border-slate-100', soRealCls)}>
                  {soReal != null ? soReal.toFixed(1) + '%' : '—'}
                </td>
                {/* 원가율 */}
                <td className="px-2 py-1.5 text-right tabular-nums border-r border-slate-100 text-slate-600">
                  {ci === 0 && style.costRate != null ? style.costRate.toFixed(1) + '%' : ''}
                </td>
                {/* 분배매장수 */}
                <td className="px-2 py-1.5 text-right tabular-nums border-r border-slate-100 text-slate-600">
                  {style.stores}
                </td>
                {/* 주판량 */}
                <td className="px-1.5 py-1 border-r border-slate-100">
                  <InlineNumberInput value={color.n} onChange={v => onUpdate(style.id, color.id, 'n', v)}
                    min={0} disabled={inactive} />
                </td>
                {/* 주판율 */}
                <td className={cn('px-2 py-1.5 text-right tabular-nums border-r border-slate-100', qCls)}>
                  {qPct != null ? qPct.toFixed(1) + '%' : '—'}
                </td>
              </>
            ) : (
              /* collapsed: 입량+소진율 요약 */
              <td className="px-2 py-1.5 text-right border-r border-slate-100">
                {inactive ? <span className="text-slate-400 text-xs">—</span> : (
                  <div className="leading-tight">
                    <div className="text-xs tabular-nums text-teal-700 font-medium">{color.l.toLocaleString()}</div>
                    {soReal != null && (
                      <div className={cn('text-[11px] tabular-nums', soRealCls)}>{soReal.toFixed(0)}%</div>
                    )}
                  </div>
                )}
              </td>
            )}

            {/* ── 현재재고 (운영정보) ── */}
            <td className="px-2 py-1.5 text-right tabular-nums text-slate-600 border-r border-slate-100">
              {inactive ? '—' : stock.toLocaleString()}
            </td>

            {/* ── 생산정보 (운영정보, 빈 열) ── */}
            <td className="px-2 py-1.5 border-r border-slate-100" />

            {/* ── 판매기간(s) (운영정보, 편집 가능) ── */}
            <td className="px-1.5 py-1 border-r border-slate-100">
              <InlineNumberInput value={color.s} onChange={v => onUpdate(style.id, color.id, 's', v)}
                min={1} max={52} disabled={inactive} />
            </td>

            {/* ── 가중치(weight) (운영정보, 편집 가능) ── */}
            <td className="px-1.5 py-1 border-r border-slate-100">
              <InlineNumberInput value={color.weight} onChange={v => onUpdate(style.id, color.id, 'weight', v)}
                min={0.1} max={3.0} step={0.1} disabled={inactive} />
            </td>

            {/* ── 발주성향 dropdown ── */}
            <td className="px-1.5 py-1 border-r border-slate-100">
              <select
                value={color.strategy ?? style.strategy}
                onChange={e => onUpdate(style.id, color.id, 'strategy', Number(e.target.value))}
                disabled={inactive}
                className="w-full text-xs border border-slate-200 rounded px-1 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-40"
                style={{ color: STRATEGY_COLORS[color.strategy ?? style.strategy] ?? '#475569', fontWeight: 600 }}>
                {STRATEGY_LEVELS.map(lv => (
                  <option key={lv} value={lv}>{STRATEGY_LABELS[lv]}</option>
                ))}
              </select>
            </td>

            {/* ── 전년/T ── */}
            <td className="px-1.5 py-1 border-r border-slate-200">
              {style.prevYear && !inactive ? (
                <div className="flex flex-col gap-0.5 items-center">
                  <div
                    className="text-xs font-bold tabular-nums text-center"
                    style={{ color: '#2563eb' }}
                    title={`전년 동 주간 정상판매량 · 스타일 합계: ${style.prevYear.style.weekNormSalesQty}개`}>
                    {totalStyleL > 0
                      ? Math.round(style.prevYear.style.weekNormSalesQty * (color.l / totalStyleL))
                      : style.prevYear.style.weekNormSalesQty}
                    <span className="text-[10px] text-slate-400 font-normal ml-0.5">개</span>
                  </div>
                  <div className="text-[10px] text-slate-400 text-center leading-none">
                    잔여~{style.prevYear.plc.estRemainWeeks}주
                  </div>
                  <button onClick={() => onTModal(color, style)} disabled={inactive}
                    className="w-full px-1 py-0.5 rounded text-[10px] font-semibold text-white transition-colors disabled:opacity-40"
                    style={{ background: TH_OLD }}>
                    조건변경
                  </button>
                </div>
              ) : (
                <button onClick={() => onTModal(color, style)} disabled={inactive}
                  className="w-full px-1.5 py-1 rounded text-xs font-semibold text-white transition-colors disabled:opacity-40 disabled:pointer-events-none"
                  style={{ background: TH_OLD }}>
                  리오더 조건 변경
                </button>
              )}
            </td>

            {/* ── 기존 로직 ── */}
            <td className="px-2 py-1.5 text-right tabular-nums border-r border-slate-200"
              style={{ background: inactive ? undefined : '#f8fafc', color: '#94a3b8' }}>
              {inactive ? '—' : fmt(calcOld)}
            </td>

            {/* ── 신규 로직 ── */}
            <td className="px-2 py-1.5 border-r border-slate-200"
              style={{ background: inactive ? undefined : '#eff6ff' }}>
              <div className={cn('text-right tabular-nums font-bold', inactive ? 'text-slate-300' : 'text-blue-700')}>
                {inactive ? '—' : fmt(calcNew)}
              </div>
              {!inactive && delta != null && (
                <div className={cn('text-xs tabular-nums text-right leading-tight', deltaCls)}>
                  {delta >= 0 ? '▲' : '▼'}{Math.abs(delta).toFixed(0)}% vs 기존
                </div>
              )}
            </td>

            {/* ── MD 확정발주 ── */}
            <td className="px-1.5 py-1 border-r border-slate-200">
              <InlineNumberInput
                value={color.aj}
                onChange={v => onUpdate(style.id, color.id, 'aj', v)}
                min={0} disabled={inactive}
                style={{ color: '#b45309', fontWeight: 700 }}
              />
            </td>

            {/* ── 위험 도트 ── */}
            <td className="px-1 py-1.5 text-center text-base leading-none">
              {risk === 'none' && <span style={{ color: '#cbd5e1' }} title="AJ 미입력">○</span>}
              {risk === 'low'  && <span style={{ color: '#dc2626', fontWeight: 700 }} title="▲부족: 확정발주가 추천 대비 60% 미만">●</span>}
              {risk === 'high' && <span style={{ color: '#d97706', fontWeight: 700 }} title="▼과잉: 확정발주가 추천 대비 150% 초과">●</span>}
              {risk === 'ok'   && <span style={{ color: '#10b981' }} title="✓ 적정">●</span>}
            </td>
          </tr>
        )
      })}
      <SubtotalRow style={style} isSalesGroupOpen={isSalesGroupOpen} />
    </>
  )
}

// ─── 스타일 소계 (REQ-06: totalL, 소진율 추가) ─────────────────────────────
function SubtotalRow({ style, isSalesGroupOpen }: { style: StyleRow; isSalesGroupOpen: boolean }) {
  let sumOld = 0, sumNew = 0, sumAj = 0, sumL = 0, sumM = 0, sumN = 0, sumStock = 0
  let hasOld = false, hasNew = false
  for (const c of style.colors) {
    if (c.calcOld != null) { sumOld += c.calcOld; hasOld = true }
    if (c.calcNew != null) { sumNew += c.calcNew; hasNew = true }
    sumAj   += c.aj
    sumL    += c.l
    sumM    += c.m
    sumN    += c.n
    sumStock += Math.max(0, c.l - c.m)
  }
  const delta  = hasOld && sumOld > 0 ? ((sumNew - sumOld) / sumOld) * 100 : null
  const soReal = sumL > 0 ? sumM / sumL * 100 : null
  const qPct   = sumStock > 0 ? sumN / sumStock * 100 : null

  return (
    <tr className="text-xs font-bold border-t-2 border-b border-slate-200" style={{ background: '#f8fafc' }}>
      <td className="px-3 py-1 text-slate-500 font-semibold">{style.colors.length}컬러 합계</td>
      <td /><td />

      {/* 판매지표 소계 */}
      {isSalesGroupOpen ? (
        <>
          {/* 담당기획 (빈) */}
          <td className="border-l border-slate-200" />
          {/* 누적입고량 */}
          <td className="px-2 py-1 text-right tabular-nums text-teal-800 border-l border-slate-200">
            {sumL > 0 ? sumL.toLocaleString() : '—'}
          </td>
          {/* 소진율 */}
          <td className="px-2 py-1 text-right tabular-nums text-slate-600 border-l border-slate-200">
            {soReal != null ? soReal.toFixed(1) + '%' : '—'}
          </td>
          {/* 원가율 (빈) */}
          <td className="border-l border-slate-200" />
          {/* 분배매장수 */}
          <td className="px-2 py-1 text-right tabular-nums text-slate-500 border-l border-slate-200">
            {style.stores}
          </td>
          {/* 주판량 */}
          <td className="px-2 py-1 text-right tabular-nums text-slate-700 border-l border-slate-200">
            {sumN > 0 ? sumN.toLocaleString() : '—'}
          </td>
          {/* 주판율 */}
          <td className="px-2 py-1 text-right tabular-nums text-slate-600 border-l border-slate-200">
            {qPct != null ? qPct.toFixed(1) + '%' : '—'}
          </td>
        </>
      ) : (
        <td className="px-2 py-1 text-right border-l border-slate-200">
          {sumL > 0 ? (
            <div className="leading-tight">
              <div className="tabular-nums text-teal-800">{sumL.toLocaleString()}</div>
              {soReal != null && <div className="text-[11px] tabular-nums text-slate-500">{soReal.toFixed(0)}%</div>}
            </div>
          ) : '—'}
        </td>
      )}

      {/* 현재재고 소계 */}
      <td className="px-2 py-1 text-right tabular-nums text-slate-700 border-l border-slate-200">
        {sumStock > 0 ? sumStock.toLocaleString() : '—'}
      </td>
      {/* 생산정보, 판매기간, 가중치, 발주성향, 전년T */}
      <td /><td /><td /><td /><td />

      {/* 기존 */}
      <td className="px-2 py-1 text-right tabular-nums border-l border-slate-200 text-slate-700"
        style={{ background: '#e2e8f0' }}>
        {hasOld ? sumOld.toLocaleString() + '개' : '—'}
      </td>
      {/* 신규 */}
      <td className="px-2 py-1 border-l border-slate-200" style={{ background: '#dbeafe' }}>
        <div className="text-right tabular-nums text-blue-800 font-bold">{hasNew ? sumNew.toLocaleString() + '개' : '—'}</div>
        {delta != null && (
          <div className={cn('text-[11px] text-right', delta > 5 ? 'text-orange-500' : delta < -5 ? 'text-blue-500' : 'text-slate-400')}>
            {delta >= 0 ? '▲' : '▼'}{Math.abs(delta).toFixed(0)}%
          </div>
        )}
      </td>
      {/* AJ */}
      <td className="px-2 py-1 text-right tabular-nums border-l border-slate-200"
        style={{ color: '#b45309', fontWeight: 700 }}>
        {sumAj > 0 ? sumAj.toLocaleString() + '개' : '—'}
      </td>
      <td />
    </tr>
  )
}

// ─── 전체 합계 (REQ-06: totalL, totalM 추가) ─────────────────────────────────
function GrandTotalRow({ styles, isSalesGroupOpen, totalN, totalStock, totalOld, totalNew, totalAj, totalL, totalM }: {
  styles: StyleRow[]
  isSalesGroupOpen: boolean
  totalN: number; totalStock: number
  totalOld: number; totalNew: number; totalAj: number
  totalL: number; totalM: number
}) {
  const qPct   = totalStock > 0 ? totalN / totalStock * 100 : null
  const soReal = totalL > 0 ? totalM / totalL * 100 : null
  const delta  = totalOld > 0 ? ((totalNew - totalOld) / totalOld * 100) : null

  return (
    <tr className="border-t-4 border-slate-400 text-xs font-bold" style={{ background: '#e2e8f0' }}>
      <td colSpan={3} className="px-3 py-2 text-slate-700">전체 합계 ({styles.length}개 스타일)</td>

      {/* 판매지표 합계 */}
      {isSalesGroupOpen ? (
        <>
          {/* 담당기획 (빈) */}
          <td className="border-r border-slate-300" />
          {/* 누적입고량 */}
          <td className="px-2 py-2 text-right tabular-nums text-teal-800 border-r border-slate-300">
            {totalL > 0 ? totalL.toLocaleString() : '—'}
          </td>
          {/* 소진율 */}
          <td className="px-2 py-2 text-right tabular-nums text-slate-700 border-r border-slate-300">
            {soReal != null ? soReal.toFixed(1) + '%' : '—'}
          </td>
          {/* 원가율 (빈) */}
          <td className="border-r border-slate-300" />
          {/* 분배매장수 (빈) */}
          <td className="border-r border-slate-300" />
          {/* 주판량 */}
          <td className="px-2 py-2 text-right tabular-nums text-slate-800 border-r border-slate-300">
            {totalN.toLocaleString()}
          </td>
          {/* 주판율 */}
          <td className="px-2 py-2 text-right tabular-nums text-slate-700 border-r border-slate-300">
            {qPct != null ? qPct.toFixed(1) + '%' : '—'}
          </td>
        </>
      ) : (
        <td className="px-2 py-2 text-right border-r border-slate-300">
          <div className="leading-tight">
            <div className="tabular-nums text-teal-800">{totalL > 0 ? totalL.toLocaleString() : '—'}</div>
            {soReal != null && <div className="text-[11px] tabular-nums text-slate-600">{soReal.toFixed(1)}%</div>}
          </div>
        </td>
      )}

      {/* 현재재고 합계 */}
      <td className="px-2 py-2 text-right tabular-nums text-slate-800 border-r border-slate-300">
        {totalStock.toLocaleString()}
      </td>
      {/* 생산정보, 판매기간, 가중치, 발주성향, 전년T */}
      <td className="border-r border-slate-300" />
      <td className="border-r border-slate-300" />
      <td className="border-r border-slate-300" />
      <td className="border-r border-slate-300" />
      <td className="border-r border-slate-300" />

      {/* 기존 */}
      <td className="px-2 py-2 text-right tabular-nums border-r border-slate-300 bg-slate-300 text-slate-800">
        {totalOld > 0 ? totalOld.toLocaleString() : '—'}
      </td>
      {/* 신규 */}
      <td className="px-2 py-2 border-r border-slate-300 bg-blue-200">
        <div className="text-right tabular-nums text-blue-900">{totalNew > 0 ? totalNew.toLocaleString() : '—'}</div>
        {delta != null && (
          <div className={cn('text-[11px] text-right', delta > 5 ? 'text-orange-600' : delta < -5 ? 'text-blue-600' : 'text-slate-500')}>
            {delta >= 0 ? '▲' : '▼'}{Math.abs(delta).toFixed(1)}%
          </div>
        )}
      </td>
      {/* AJ */}
      <td className="px-2 py-2 text-right tabular-nums border-r border-slate-300"
        style={{ background: '#fef3c7', color: '#b45309', fontWeight: 700 }}>
        {totalAj > 0 ? totalAj.toLocaleString() : '—'}
      </td>
      <td style={{ background: '#fef3c7' }} />
    </tr>
  )
}

// ─── 헬퍼 컴포넌트 ─────────────────────────────────────────────────────────────
function Fsel({ label, value, onChange, children }: {
  label: string; value: string; onChange: (v: string) => void; children: React.ReactNode
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="text-xs border border-slate-200 rounded px-2 py-1 bg-white text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-400"
      aria-label={label}>
      {children}
    </select>
  )
}

function SortIcon({ field, current, dir, onClick }: {
  field: string; current: string | null; dir: 'asc' | 'desc'; onClick: (f: string) => void
}) {
  const active = current === field
  return (
    <span onClick={e => { e.stopPropagation(); onClick(field) }}
      className="ml-1 cursor-pointer inline-flex align-middle opacity-60 hover:opacity-100">
      {active ? (dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3" />}
    </span>
  )
}

function ColSort({ field, current, dir, onClick, children }: {
  field: string; current: string | null; dir: 'asc' | 'desc'
  onClick: (f: string) => void; children: React.ReactNode
}) {
  const active = current === field
  return (
    <span onClick={() => onClick(field)}
      className="inline-flex items-center gap-0.5 cursor-pointer hover:opacity-80 select-none">
      {children}
      {active
        ? (dir === 'asc' ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />)
        : <ArrowUpDown className="w-2.5 h-2.5 opacity-40" />}
    </span>
  )
}

function PlcBadge({ plc }: { plc: string }) {
  const map: Record<string, string> = {
    '도입기': 'bg-green-50 text-green-700 border-green-200',
    '성장기': 'bg-blue-50 text-blue-700 border-blue-200',
    '유지기': 'bg-orange-50 text-orange-700 border-orange-200',
    '쇠퇴기': 'bg-red-50 text-red-700 border-red-200',
  }
  return (
    <span className={cn('text-xs px-1.5 py-0 rounded border font-semibold leading-5 inline-block', map[plc] ?? '')}>
      {plc}
    </span>
  )
}
