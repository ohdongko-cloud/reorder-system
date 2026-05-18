'use client'

import { useCallback, useState, useMemo } from 'react'
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
import { CheckCircle, X, Copy, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import type { ColorRow, StyleRow, Strategy, StyleBadge } from '@/types/reorder'

const GOTHIC = "'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif"

// ── 헤더 배경색 (HTML 레퍼런스 기준) ──────────────────────────
const TH_BASE   = '#1e293b'   // 기본 th
const TH_GROUP  = '#0f172a'   // 그룹 헤더
const TH_OLD    = '#334155'   // 기존 로직
const TH_NEW    = '#1e3a5f'   // 신규 로직
const TH_AJ     = '#064e3b'   // MD 확정

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString()
}

interface TModalState { open: boolean; color: ColorRow | null; style: StyleRow | null }
const STRATEGY_LEVELS: Strategy[] = [1, 2, 3, 4, 5]

// ── 스타일별 집계값 (정렬용) ──────────────────────────────────
function styleAgg(style: StyleRow) {
  let sumN = 0, sumStock = 0, sumOld = 0, sumNew = 0, sumAj = 0
  for (const c of style.colors) {
    sumN += c.n
    sumStock += Math.max(0, c.l - c.m)
    sumOld += c.calcOld ?? 0
    sumNew += c.calcNew ?? 0
    sumAj  += c.aj
  }
  return {
    sumN,
    qPct: sumStock > 0 ? sumN / sumStock : 0,
    sumStock,
    sumOld,
    sumNew,
    sumAj,
  }
}

// ── 상태 배지 ────────────────────────────────────────────────
interface StatusBadge { label: string; cls: string }
function getStatusBadges(style: StyleRow): StatusBadge[] {
  const result: StatusBadge[] = []
  const agg = styleAgg(style)

  const anyHigh = style.colors.some(c => {
    const stock = c.l - c.m
    return stock > 0 && c.n / stock * 100 >= 10
  })
  if (anyHigh) result.push({ label: '고회전', cls: 'bg-orange-100 text-orange-800 border-orange-300' })
  if (style.plc === '쇠퇴기') result.push({ label: '시즌종료', cls: 'bg-red-100 text-red-700 border-red-200' })

  const totalL = style.colors.reduce((a, c) => a + c.l, 0)
  const totalM = style.colors.reduce((a, c) => a + c.m, 0)
  const soreal = totalL > 0 ? totalM / totalL * 100 : 0
  if (style.days_since_inbound >= 50 && soreal < 40 && totalL > 0) {
    result.push({ label: '저소진', cls: 'bg-yellow-100 text-yellow-800 border-yellow-300' })
  }
  return result
}

// ── 위험 도트 계산 ──────────────────────────────────────────
type RiskLevel = 'none' | 'caution' | 'danger'
function getRisk(color: ColorRow): RiskLevel {
  if (color.aj <= 0 || color.calcNew == null || color.calcNew <= 0) return 'none'
  const ratio = color.aj / color.calcNew
  if (ratio > 1.5 || ratio < 0.5) return 'danger'
  if (ratio > 1.2 || ratio < 0.8) return 'caution'
  return 'none'
}

export function CalcResultsPage() {
  const styles           = useReorderStore(s => s.styles)
  const updateColorField = useReorderStore(s => s.updateColorField)
  const setAllStrategies = useReorderStore(s => s.setAllStrategies)
  const currentSession   = useReorderStore(s => s.currentSession)

  // 필터
  const [yearFilter,    setYearFilter]    = useState('all')
  const [seasonFilter,  setSeasonFilter]  = useState('all')
  const [badgeFilter,   setBadgeFilter]   = useState('all')
  const [itemFilter,    setItemFilter]    = useState('all')
  const [plannerFilter, setPlannerFilter] = useState('all')
  const [factoryFilter, setFactoryFilter] = useState('all')
  const [qtyFilter,     setQtyFilter]     = useState<'300+' | 'all'>('300+')

  // 정렬
  const [sortField, setSortField] = useState<string | null>(null)
  const [sortDir,   setSortDir]   = useState<'asc' | 'desc'>('asc')

  const [tModal,       setTModal]       = useState<TModalState>({ open: false, color: null, style: null })
  const [confirmModal, setConfirmModal] = useState(false)

  function toggleSort(field: string) {
    setSortField(prev => {
      if (prev === field) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return field }
      setSortDir('asc')
      return field
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
      if (yearFilter   !== 'all' && String(year)   !== yearFilter) return false
      if (seasonFilter !== 'all' && String(season) !== seasonFilter) return false
      if (badgeFilter  !== 'all' && !style.badges.includes(badgeFilter as StyleBadge)) return false
      if (itemFilter   !== 'all' && item !== itemFilter) return false
      if (qtyFilter    === '300+' && !style.colors.some(c => (c.calcNew ?? 0) >= MIN_RECOMMEND_QTY)) return false
      return true
    })
  }, [styles, yearFilter, seasonFilter, badgeFilter, itemFilter, qtyFilter])

  const sortedStyles = useMemo(() => {
    if (!sortField) return filteredStyles
    return [...filteredStyles].sort((a, b) => {
      const av = styleAgg(a), bv = styleAgg(b)
      let diff = 0
      if (sortField === 'code')      diff = a.code.localeCompare(b.code)
      else if (sortField === 'sumN') diff = av.sumN - bv.sumN
      else if (sortField === 'qPct') diff = av.qPct - bv.qPct
      else if (sortField === 'sumStock') diff = av.sumStock - bv.sumStock
      else if (sortField === 'sumOld') diff = av.sumOld - bv.sumOld
      else if (sortField === 'sumNew') diff = av.sumNew - bv.sumNew
      else if (sortField === 'sumAj')  diff = av.sumAj  - bv.sumAj
      return sortDir === 'asc' ? diff : -diff
    })
  }, [filteredStyles, sortField, sortDir])

  // 집계
  let totalOld = 0, totalNew = 0, totalAj = 0, totalN = 0, totalStock = 0, totalColors = 0
  for (const style of sortedStyles) {
    for (const c of style.colors) {
      totalOld   += c.calcOld ?? 0
      totalNew   += c.calcNew ?? 0
      totalAj    += c.aj
      totalN     += c.n
      totalStock += Math.max(0, c.l - c.m)
      totalColors++
    }
  }

  // 전체 성향 (모든 컬러가 동일 성향일 때 활성)
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

  function handleExcelCopy() {
    const header = ['스타일', '컬러', 'PLC', '주판량', '주판율%', '현재재고', '발주성향', '기존제안', '신규제안', 'MD확정']
    const rows = [header]
    for (const style of sortedStyles) {
      for (const c of style.colors) {
        const stock = Math.max(0, c.l - c.m)
        const qPct  = stock > 0 ? (c.n / stock * 100).toFixed(1) : ''
        rows.push([style.code, c.color_name, style.plc, String(c.n), qPct, String(stock),
          String(c.strategy ?? style.strategy), String(c.calcOld ?? ''), String(c.calcNew ?? ''), String(c.aj || '')])
      }
    }
    navigator.clipboard.writeText(rows.map(r => r.join('\t')).join('\n'))
      .then(() => toast.success('클립보드에 복사됐습니다'))
      .catch(() => toast.error('복사 실패'))
  }

  const sessionLabel = currentSession ? `${currentSession.name} (${getWeekRange(currentSession.base_date)})` : null

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
      <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between shrink-0">
        <div>
          <div className="text-base font-bold text-slate-800">계산 결과</div>
          <div className="text-sm text-slate-500 mt-0.5">
            {sortedStyles.length}개 스타일 · {totalColors}개 컬러
            {sessionLabel && <span className="ml-2 text-slate-400">· {sessionLabel}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExcelCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            <Copy className="w-3.5 h-3.5" />엑셀 복사
          </button>
          <button onClick={() => setConfirmModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded hover:bg-blue-700 transition-colors">
            <CheckCircle className="w-3.5 h-3.5" />발주 확정
          </button>
        </div>
      </div>

      {/* ── 전략 바 — 세그먼트 컨트롤 ── */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center gap-3 shrink-0">
        <span className="text-xs text-slate-500 font-semibold shrink-0">전체 발주성향 일괄설정</span>
        <div className="inline-flex rounded-md overflow-hidden border border-slate-300 shadow-sm">
          {STRATEGY_LEVELS.map(lv => {
            const isActive = globalStrategy === lv
            const color = STRATEGY_COLORS[lv]
            return (
              <button key={lv} onClick={() => setAllStrategies(lv)}
                className="px-3 py-1.5 text-xs font-semibold border-r border-slate-300 last:border-r-0 transition-colors"
                style={isActive
                  ? { background: color, color: '#fff', borderColor: color }
                  : { background: '#fff', color: '#64748b' }}>
                {STRATEGY_LABELS[lv]}
              </button>
            )
          })}
        </div>
        <span className="text-xs text-slate-400">개별 컬러는 테이블 내 드롭다운으로 조정</span>
      </div>

      {/* ── 필터 바 ── */}
      <div className="bg-white border-b border-slate-200 px-4 py-1.5 flex items-center gap-2 shrink-0 flex-wrap">
        <span className="text-xs text-slate-500 font-semibold shrink-0">필터</span>
        <Fsel label="연도" value={yearFilter} onChange={setYearFilter}>
          <option value="all">전체 연도</option>
          {uniqueYears.map(y => <option key={y} value={y}>{y}</option>)}
        </Fsel>
        <Fsel label="시즌" value={seasonFilter} onChange={setSeasonFilter}>
          <option value="all">전체 시즌</option>
          {[1,2,3,4].map(s => <option key={s} value={String(s)}>{s}시즌</option>)}
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
        <Fsel label="담당기획" value={plannerFilter} onChange={setPlannerFilter}>
          <option value="all">전체 기획자</option>
        </Fsel>
        <Fsel label="공장" value={factoryFilter} onChange={setFactoryFilter}>
          <option value="all">전체 공장</option>
        </Fsel>
        <div className="ml-auto">
          <Fsel label="추천수량" value={qtyFilter} onChange={v => setQtyFilter(v as '300+' | 'all')}>
            <option value="300+">≥{MIN_RECOMMEND_QTY}장 추천 대상</option>
            <option value="all">전체 보기</option>
          </Fsel>
        </div>
      </div>

      {/* ── 테이블 ── */}
      {sortedStyles.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-slate-400 py-16">
          <div className="text-3xl mb-2">🔍</div>
          <div className="text-base">조건에 맞는 스타일이 없습니다.</div>
          <button onClick={() => { setYearFilter('all'); setSeasonFilter('all'); setBadgeFilter('all'); setItemFilter('all'); setQtyFilter('all') }}
            className="mt-2 text-sm text-blue-500 underline">필터 초기화</button>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="border-collapse bg-white text-sm w-full" style={{ minWidth: 1040 }}>
            <colgroup>
              <col style={{ width: 200 }} />{/* 스타일 */}
              <col style={{ width: 100 }} />{/* 컬러 */}
              <col style={{ width: 56 }} />{/* PLC */}
              <col style={{ width: 80 }} />{/* 주판량 */}
              <col style={{ width: 70 }} />{/* 주판율 */}
              <col style={{ width: 80 }} />{/* 현재재고 */}
              <col style={{ width: 90 }} />{/* 발주성향 */}
              <col style={{ width: 88 }} />{/* 전년T */}
              <col style={{ width: 90 }} />{/* 기존로직 */}
              <col style={{ width: 100 }} />{/* 신규로직 */}
              <col style={{ width: 90 }} />{/* MD확정발주 */}
              <col style={{ width: 48 }} />{/* 위험 */}
            </colgroup>

            <thead className="sticky top-0 z-20">
              {/* ── 그룹 헤더 행 ── */}
              <tr style={{ color: '#e2e8f0', fontSize: 11 }}>
                <th rowSpan={2} className="px-3 py-2 text-left align-bottom border-r border-slate-600"
                  style={{ background: TH_BASE }}>
                  상품
                  <SortIcon field="code" current={sortField} dir={sortDir} onClick={toggleSort} />
                </th>
                <th rowSpan={2} className="px-2 py-2 text-left align-bottom border-r border-slate-600"
                  style={{ background: TH_BASE }}>컬러</th>
                <th rowSpan={2} className="px-1 py-2 text-center align-bottom border-r border-slate-600"
                  style={{ background: TH_BASE }}>PLC</th>
                {/* 판매 현황 */}
                <th colSpan={3} className="px-2 pt-1.5 pb-0.5 text-center font-bold border-r border-slate-600"
                  style={{ background: TH_GROUP }}>판매 현황</th>
                {/* 발주 설정 */}
                <th colSpan={2} className="px-2 pt-1.5 pb-0.5 text-center font-bold border-r border-slate-600"
                  style={{ background: TH_GROUP }}>발주 설정</th>
                {/* 기존 */}
                <th rowSpan={2} className="px-2 py-2 text-center align-bottom border-r border-slate-600"
                  style={{ background: TH_OLD }}>
                  <ColSort field="sumOld" current={sortField} dir={sortDir} onClick={toggleSort}>기존 로직</ColSort>
                </th>
                {/* 신규 */}
                <th rowSpan={2} className="px-2 py-2 text-center align-bottom border-r border-slate-600"
                  style={{ background: TH_NEW }}>
                  <ColSort field="sumNew" current={sortField} dir={sortDir} onClick={toggleSort}>신규 로직</ColSort>
                </th>
                {/* MD 확정 */}
                <th colSpan={2} className="px-2 pt-1.5 pb-0.5 text-center font-bold"
                  style={{ background: TH_AJ }}>MD 확정</th>
              </tr>

              {/* ── 서브 헤더 행 ── */}
              <tr style={{ color: '#cbd5e1', fontSize: 10 }}>
                {/* 판매현황 서브 */}
                <th className="px-1 pb-1.5 text-center border-r border-slate-600" style={{ background: TH_GROUP }}>
                  <ColSort field="sumN" current={sortField} dir={sortDir} onClick={toggleSort}>주판량</ColSort>
                </th>
                <th className="px-1 pb-1.5 text-center border-r border-slate-600" style={{ background: TH_GROUP }}>
                  <ColSort field="qPct" current={sortField} dir={sortDir} onClick={toggleSort}>주판율</ColSort>
                </th>
                <th className="px-1 pb-1.5 text-center border-r border-slate-600" style={{ background: TH_GROUP }}>
                  <ColSort field="sumStock" current={sortField} dir={sortDir} onClick={toggleSort}>현재재고</ColSort>
                </th>
                {/* 발주설정 서브 */}
                <th className="px-1 pb-1.5 text-center border-r border-slate-600" style={{ background: TH_GROUP }}>발주성향</th>
                <th className="px-1 pb-1.5 text-center border-r border-slate-600" style={{ background: TH_GROUP }}>전년 T값</th>
                {/* MD확정 서브 */}
                <th className="px-1 pb-1.5 text-center border-r border-slate-600" style={{ background: TH_AJ }}>
                  <ColSort field="sumAj" current={sortField} dir={sortDir} onClick={toggleSort}>확정발주</ColSort>
                </th>
                <th className="px-1 pb-1.5 text-center" style={{ background: TH_AJ }}>위험</th>
              </tr>

              {/* ── 구분선 ── */}
              <tr><td colSpan={12} className="p-0 h-0.5 bg-slate-900" /></tr>
            </thead>

            <tbody>
              {sortedStyles.map(style => (
                <StyleRows key={style.id} style={style}
                  onTModal={(c, s) => setTModal({ open: true, color: c, style: s })}
                  onUpdate={update} />
              ))}
              <GrandTotalRow
                styles={sortedStyles}
                totalN={totalN} totalStock={totalStock}
                totalOld={totalOld} totalNew={totalNew} totalAj={totalAj} />
            </tbody>
          </table>
        </div>
      )}

      {/* ── 하단 서머리 바 ── */}
      <div className="bg-slate-900 text-white px-4 py-2 flex items-center gap-5 text-xs shrink-0">
        <span className="text-slate-400 font-medium shrink-0">스타일 {sortedStyles.length}개</span>
        <SummaryItem label="기존 로직 합계" value={`${totalOld.toLocaleString()} pcs`} cls="text-slate-200" />
        <SummaryItem label="신규 로직 합계" value={`${totalNew.toLocaleString()} pcs`} cls="text-blue-300 font-bold">
          {totalOld > 0 && (
            <span className={cn('ml-1', totalNew > totalOld ? 'text-red-400' : 'text-blue-400')}>
              ({totalNew > totalOld ? '▲' : '▼'}{Math.abs((totalNew - totalOld) / totalOld * 100).toFixed(1)}%)
            </span>
          )}
        </SummaryItem>
        <SummaryItem label="MD 확정 합계" value={totalAj > 0 ? `${totalAj.toLocaleString()} pcs` : '—'} cls="text-emerald-300 font-bold" />
        <button
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-xs font-semibold transition-colors shrink-0">
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
          <div className="bg-white rounded-xl shadow-xl w-80 p-6" style={{ fontFamily: GOTHIC }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800">발주 확정</h3>
              <button onClick={() => setConfirmModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 mb-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">스타일 수</span>
                <span className="font-semibold">{sortedStyles.length}개</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">신규 로직 합계</span>
                <span className="font-bold text-blue-700">{totalNew.toLocaleString()} pcs</span>
              </div>
              {totalAj > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">MD 확정 합계</span>
                  <span className="font-bold text-emerald-700">{totalAj.toLocaleString()} pcs</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmModal(false)}
                className="px-4 py-1.5 rounded border border-slate-300 text-sm text-slate-600 hover:bg-slate-50">취소</button>
              <button onClick={() => {
                setConfirmModal(false)
                toast.success('발주가 확정되었습니다.', {
                  description: `총 ${(totalAj > 0 ? totalAj : totalNew).toLocaleString()} pcs · ${sortedStyles.length}개 스타일`
                })
              }} className="px-4 py-1.5 rounded bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">확정</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── StyleRows ────────────────────────────────────────────
function StyleRows({ style, onTModal, onUpdate }: {
  style: StyleRow
  onTModal: (c: ColorRow, s: StyleRow) => void
  onUpdate: (sid: string, cid: string, f: 'n' | 's' | 't' | 'r' | 'aj' | 'weight' | 'strategy', v: number) => void
}) {
  const colorCount   = style.colors.length
  const statusBadges = getStatusBadges(style)
  const { year, season, item } = parseStyleCode(style.code)

  return (
    <>
      {style.colors.map((color, ci) => {
        const inactive = color.l === 0
        const { calcOld, calcNew, delta } = color
        const stock  = Math.max(0, color.l - color.m)
        const qPct   = stock > 0 ? color.n / stock * 100 : null
        const risk   = getRisk(color)

        const qCls = qPct == null ? 'text-slate-400'
          : qPct >= 10 ? 'text-red-600 font-bold'
          : qPct >= 7  ? 'text-amber-600 font-semibold'
          : 'text-slate-600'

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
                  <div className="w-14 h-[72px] shrink-0 border-2 border-dashed border-slate-200 rounded-md flex items-center justify-center text-xs text-slate-300 font-bold bg-slate-50 select-none">
                    IMG
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="font-mono text-sm font-bold text-slate-800 leading-tight">{style.code}</div>
                    <div className="text-xs text-slate-400 leading-tight truncate">상품명 —</div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {year   && <span className="text-[10px] px-1 py-0 rounded bg-slate-100 text-slate-600 border border-slate-200 font-semibold leading-4">{year}</span>}
                      {season && <span className="text-[10px] px-1 py-0 rounded bg-slate-100 text-slate-600 border border-slate-200 font-semibold leading-4">{season}시즌</span>}
                      {item   && <span className="text-[10px] px-1 py-0 rounded bg-slate-100 text-slate-600 border border-slate-200 font-semibold leading-4">{item}</span>}
                    </div>
                    {style.badges.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {style.badges.map(b => (
                          <span key={b} className={cn('text-[10px] px-1.5 py-0 rounded border font-semibold leading-4', STYLE_BADGE_COLORS[b])}>
                            {STYLE_BADGE_LABELS[b]}
                          </span>
                        ))}
                      </div>
                    )}
                    {statusBadges.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {statusBadges.map((b, i) => (
                          <span key={i} className={cn('text-[10px] px-1.5 py-0 rounded border font-semibold leading-4', b.cls)}>
                            {b.label}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="text-[10px] text-slate-400 leading-tight">
                      ₩{style.price.toLocaleString()} · {style.days_since_inbound}일 · {style.stores}매장 · {colorCount}컬러
                    </div>
                  </div>
                </div>
              </td>
            )}

            {/* ── 컬러 ── */}
            <td className="px-2 py-1.5 border-r border-slate-100">
              <div className="flex items-center gap-1.5">
                {color.color_hex && (
                  <span className="w-3 h-3 rounded-full border border-black/10 shrink-0"
                    style={{ background: color.color_hex }} />
                )}
                <span className="text-xs text-slate-700 truncate">{color.color_name}</span>
              </div>
            </td>

            {/* ── PLC ── */}
            <td className="px-1 py-1.5 text-center border-r border-slate-100">
              {ci === 0 && <PlcBadge plc={style.plc} />}
            </td>

            {/* ── 주판량 ── */}
            <td className="px-1.5 py-1 border-r border-slate-100">
              <InlineNumberInput value={color.n} onChange={v => onUpdate(style.id, color.id, 'n', v)}
                min={0} disabled={inactive} />
            </td>

            {/* ── 주판율 ── */}
            <td className={cn('px-2 py-1 text-right tabular-nums text-xs border-r border-slate-100', qCls)}>
              {qPct != null ? qPct.toFixed(1) + '%' : '—'}
            </td>

            {/* ── 현재재고 ── */}
            <td className="px-2 py-1 text-right tabular-nums text-xs text-slate-600 border-r border-slate-100">
              {inactive ? '—' : stock.toLocaleString()}
            </td>

            {/* ── 발주성향 dropdown ── */}
            <td className="px-1.5 py-1 border-r border-slate-100">
              <select
                value={color.strategy ?? style.strategy}
                onChange={e => onUpdate(style.id, color.id, 'strategy', Number(e.target.value))}
                disabled={inactive}
                className="w-full text-[10px] border border-slate-200 rounded px-1 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-40"
                style={{
                  color: STRATEGY_COLORS[color.strategy ?? style.strategy] ?? '#475569',
                  fontWeight: 600,
                }}>
                {STRATEGY_LEVELS.map(lv => (
                  <option key={lv} value={lv}>{STRATEGY_LABELS[lv]}</option>
                ))}
              </select>
            </td>

            {/* ── 전년T 버튼 ── */}
            <td className="px-1.5 py-1 border-r border-slate-200">
              <button onClick={() => onTModal(color, style)} disabled={inactive}
                className="w-full px-1.5 py-1 rounded text-[10px] font-semibold text-white transition-colors disabled:opacity-40 disabled:pointer-events-none"
                style={{ background: TH_OLD }}>
                전년상품
              </button>
            </td>

            {/* ── 기존 로직 ── */}
            <td className="px-2 py-1 text-right tabular-nums border-r border-slate-200"
              style={{ background: inactive ? undefined : '#f8fafc' }}>
              <span className={cn('text-sm font-semibold', inactive ? 'text-slate-300' : 'text-slate-600')}>
                {inactive ? '—' : fmt(calcOld)}
              </span>
            </td>

            {/* ── 신규 로직 ── */}
            <td className="px-2 py-1 border-r border-slate-200"
              style={{ background: inactive ? undefined : '#eff6ff' }}>
              <div className={cn('text-right tabular-nums font-bold text-sm', inactive ? 'text-slate-300' : 'text-blue-700')}>
                {inactive ? '—' : fmt(calcNew)}
              </div>
              {!inactive && delta != null && (
                <div className={cn('text-[10px] tabular-nums text-right leading-tight', deltaCls)}>
                  {delta >= 0 ? '▲' : '▼'}{Math.abs(delta).toFixed(1)}%
                </div>
              )}
            </td>

            {/* ── MD 확정발주 ── */}
            <td className="px-1.5 py-1 border-r border-slate-200"
              style={{ background: '#f0fdf4' }}>
              <InlineNumberInput value={color.aj} onChange={v => onUpdate(style.id, color.id, 'aj', v)}
                min={0} disabled={inactive} />
            </td>

            {/* ── 위험 도트 ── */}
            <td className="px-1 py-1 text-center" style={{ background: '#f0fdf4' }}>
              {risk === 'danger'  && <span className="inline-block w-3 h-3 rounded-full bg-red-500" title="과다/과소발주 위험 (±50% 이상 차이)" />}
              {risk === 'caution' && <span className="inline-block w-3 h-3 rounded-full bg-amber-400" title="발주량 주의 (±20~50% 차이)" />}
              {risk === 'none'    && color.aj > 0 && <span className="inline-block w-3 h-3 rounded-full bg-emerald-400" title="정상 범위" />}
            </td>
          </tr>
        )
      })}
      <SubtotalRow style={style} />
    </>
  )
}

// ─── 스타일 소계 ──────────────────────────────────────────
function SubtotalRow({ style }: { style: StyleRow }) {
  let sumOld = 0, sumNew = 0, sumN = 0, sumStock = 0, sumAj = 0
  let hasOld = false, hasNew = false
  for (const c of style.colors) {
    if (c.calcOld != null) { sumOld += c.calcOld; hasOld = true }
    if (c.calcNew != null) { sumNew += c.calcNew; hasNew = true }
    sumN += c.n; sumStock += Math.max(0, c.l - c.m); sumAj += c.aj
  }
  const delta = hasOld && sumOld > 0 ? ((sumNew - sumOld) / sumOld) * 100 : null
  const qPct  = sumStock > 0 ? sumN / sumStock * 100 : null

  return (
    <tr className="text-xs font-bold border-t-2 border-b border-slate-300"
      style={{ background: '#f8fafc' }}>
      <td colSpan={3} className="px-3 py-1 text-slate-500 font-semibold">
        {style.colors.length}컬러 합계
      </td>
      {/* 주판량 */}
      <td className="px-2 py-1 text-right tabular-nums text-slate-700 border-r border-slate-200">
        {sumN.toLocaleString()}
      </td>
      {/* 주판율 */}
      <td className="px-2 py-1 text-right tabular-nums text-slate-600 border-r border-slate-200">
        {qPct != null ? qPct.toFixed(1) + '%' : '—'}
      </td>
      {/* 현재재고 */}
      <td className="px-2 py-1 text-right tabular-nums text-slate-700 border-r border-slate-200">
        {sumStock.toLocaleString()}
      </td>
      {/* 발주성향/전년T */}
      <td className="border-r border-slate-200" />
      <td className="border-r border-slate-200" />
      {/* 기존 */}
      <td className="px-2 py-1 text-right tabular-nums border-r border-slate-200 text-slate-700"
        style={{ background: '#e2e8f0' }}>
        {hasOld ? sumOld.toLocaleString() : '—'}
      </td>
      {/* 신규 */}
      <td className="px-2 py-1 border-r border-slate-200" style={{ background: '#dbeafe' }}>
        <div className="text-right tabular-nums text-blue-800">{hasNew ? sumNew.toLocaleString() : '—'}</div>
        {delta != null && (
          <div className={cn('text-[10px] tabular-nums text-right', delta > 5 ? 'text-orange-500' : delta < -5 ? 'text-blue-500' : 'text-slate-400')}>
            {delta >= 0 ? '▲' : '▼'}{Math.abs(delta).toFixed(1)}%
          </div>
        )}
      </td>
      {/* MD 확정 */}
      <td className="px-2 py-1 text-right tabular-nums text-emerald-800 border-r border-slate-200"
        style={{ background: '#dcfce7' }}>
        {sumAj > 0 ? sumAj.toLocaleString() : '—'}
      </td>
      <td style={{ background: '#dcfce7' }} />
    </tr>
  )
}

// ─── 전체 합계 ────────────────────────────────────────────
function GrandTotalRow({ styles, totalN, totalStock, totalOld, totalNew, totalAj }: {
  styles: StyleRow[]; totalN: number; totalStock: number; totalOld: number; totalNew: number; totalAj: number
}) {
  const qPct  = totalStock > 0 ? totalN / totalStock * 100 : null
  const delta = totalOld > 0 ? ((totalNew - totalOld) / totalOld * 100) : null

  return (
    <tr className="border-t-4 border-slate-400 text-xs font-bold" style={{ background: '#e2e8f0' }}>
      <td colSpan={3} className="px-3 py-2 text-slate-700">
        전체 합계 ({styles.length}개 스타일)
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-slate-800 border-r border-slate-300">
        {totalN.toLocaleString()}
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-slate-700 border-r border-slate-300">
        {qPct != null ? qPct.toFixed(1) + '%' : '—'}
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-slate-800 border-r border-slate-300">
        {totalStock.toLocaleString()}
      </td>
      <td className="border-r border-slate-300" />
      <td className="border-r border-slate-300" />
      <td className="px-2 py-2 text-right tabular-nums border-r border-slate-300 bg-slate-300 text-slate-800">
        {totalOld > 0 ? totalOld.toLocaleString() : '—'}
      </td>
      <td className="px-2 py-2 border-r border-slate-300 bg-blue-200">
        <div className="text-right tabular-nums text-blue-900">{totalNew > 0 ? totalNew.toLocaleString() : '—'}</div>
        {delta != null && (
          <div className={cn('text-[10px] tabular-nums text-right', delta > 5 ? 'text-orange-600' : delta < -5 ? 'text-blue-600' : 'text-slate-500')}>
            {delta >= 0 ? '▲' : '▼'}{Math.abs(delta).toFixed(1)}%
          </div>
        )}
      </td>
      <td className="px-2 py-2 text-right tabular-nums border-r border-slate-300 bg-emerald-200 text-emerald-900">
        {totalAj > 0 ? totalAj.toLocaleString() : '—'}
      </td>
      <td className="bg-emerald-200" />
    </tr>
  )
}

// ─── 헬퍼 컴포넌트 ────────────────────────────────────────
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
    <span onClick={() => onClick(field)} className="inline-flex items-center gap-0.5 cursor-pointer hover:opacity-80 select-none">
      {children}
      {active
        ? (dir === 'asc' ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />)
        : <ArrowUpDown className="w-2.5 h-2.5 opacity-40" />}
    </span>
  )
}

function PlcBadge({ plc }: { plc: string }) {
  const map: Record<string, string> = {
    '도입기': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    '성장기': 'bg-blue-50 text-blue-700 border-blue-200',
    '유지기': 'bg-orange-50 text-orange-700 border-orange-200',
    '쇠퇴기': 'bg-red-50 text-red-700 border-red-200',
  }
  return (
    <span className={cn('text-[10px] px-1.5 py-0 rounded border font-semibold leading-4 inline-block', map[plc] ?? '')}>
      {plc}
    </span>
  )
}

function SummaryItem({ label, value, cls, children }: {
  label: string; value: string; cls?: string; children?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="text-slate-400">{label}:</span>
      <span className={cls}>{value}</span>
      {children}
    </div>
  )
}
