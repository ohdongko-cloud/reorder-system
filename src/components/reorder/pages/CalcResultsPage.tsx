'use client'

import { useCallback, useState, useMemo } from 'react'
import { useReorderStore } from '@/store/reorder-store'
import { InlineNumberInput } from '../InlineNumberInput'
import { StrategySelector } from '../StrategySelector'
import { TModal } from '../TModal'
import {
  STRATEGY_LABELS, STRATEGY_COLORS, MIN_RECOMMEND_QTY,
  STYLE_BADGE_LABELS, STYLE_BADGE_COLORS,
  parseStyleCode, getWeekRange,
} from '@/lib/constants'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { CheckCircle, X, Copy, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import type { ColorRow, StyleRow, PlcStage, Strategy, StyleBadge } from '@/types/reorder'

const GOTHIC = "'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif"

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString()
}

interface TModalState { open: boolean; color: ColorRow | null; style: StyleRow | null }
const STRATEGY_LEVELS: Strategy[] = [1, 2, 3, 4, 5]
const WEIGHT_OPTIONS = Array.from({ length: 11 }, (_, i) => parseFloat((1.0 + i * 0.1).toFixed(1)))

// ── 스타일별 집계값 (정렬용)
function styleAgg(style: StyleRow) {
  let sumL = 0, sumM = 0, sumN = 0, sumStock = 0, sumOld = 0, sumNew = 0
  for (const c of style.colors) {
    sumL += c.l; sumM += c.m; sumN += c.n
    sumStock += (c.l - c.m)
    sumOld += c.calcOld ?? 0
    sumNew += c.calcNew ?? 0
  }
  return {
    sumL,
    soreal: sumL > 0 ? sumM / sumL : 0,
    sumN,
    qPct: sumStock > 0 ? sumN / sumStock : 0,
    sumStock,
    sumOld,
    sumNew,
  }
}

// ── 상태 배지 자동 산출
interface StatusBadge { label: string; cls: string }
function getStatusBadges(style: StyleRow): StatusBadge[] {
  const result: StatusBadge[] = []
  const agg = styleAgg(style)

  // 고회전: 어느 컬러든 주판율 10% 이상
  const anyHigh = style.colors.some(c => {
    const stock = c.l - c.m
    return stock > 0 && c.n / stock * 100 >= 10
  })
  if (anyHigh) result.push({ label: '고회전', cls: 'bg-orange-100 text-orange-800 border-orange-300' })

  // 시즌종료: 쇠퇴기
  if (style.plc === '쇠퇴기') result.push({ label: '시즌종료', cls: 'bg-red-100 text-red-700 border-red-200' })

  // 저소진 위험: 경과 50일 이상인데 소진율 40% 미만
  const soreal = agg.soreal * 100
  if (style.days_since_inbound >= 50 && soreal < 40 && agg.sumL > 0) {
    result.push({ label: '저소진', cls: 'bg-yellow-100 text-yellow-800 border-yellow-300' })
  }

  return result
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
      if (prev === field) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        return field
      }
      setSortDir('asc')
      return field
    })
  }

  // 필터용 고유값
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

  // 필터링
  const filteredStyles = useMemo(() => {
    return styles.filter(style => {
      const { year, season, item } = parseStyleCode(style.code)
      if (yearFilter   !== 'all' && String(year)   !== yearFilter)              return false
      if (seasonFilter !== 'all' && String(season) !== seasonFilter)             return false
      if (badgeFilter  !== 'all' && !style.badges.includes(badgeFilter as StyleBadge)) return false
      if (itemFilter   !== 'all' && item !== itemFilter)                         return false
      if (qtyFilter    === '300+' && !style.colors.some(c => (c.calcNew ?? 0) >= MIN_RECOMMEND_QTY)) return false
      return true
    })
  }, [styles, yearFilter, seasonFilter, badgeFilter, itemFilter, qtyFilter])

  // 정렬
  const sortedStyles = useMemo(() => {
    if (!sortField) return filteredStyles
    return [...filteredStyles].sort((a, b) => {
      const av = styleAgg(a), bv = styleAgg(b)
      let diff = 0
      if (sortField === 'code')      diff = a.code.localeCompare(b.code)
      else if (sortField === 'sumL') diff = av.sumL - bv.sumL
      else if (sortField === 'soreal') diff = av.soreal - bv.soreal
      else if (sortField === 'sumN') diff = av.sumN - bv.sumN
      else if (sortField === 'qPct') diff = av.qPct - bv.qPct
      else if (sortField === 'sumStock') diff = av.sumStock - bv.sumStock
      else if (sortField === 'sumOld') diff = av.sumOld - bv.sumOld
      else if (sortField === 'sumNew') diff = av.sumNew - bv.sumNew
      return sortDir === 'asc' ? diff : -diff
    })
  }, [filteredStyles, sortField, sortDir])

  // 집계
  let totalOld = 0, totalNew = 0, totalL = 0, totalM = 0, totalN = 0, totalStock = 0, totalColors = 0
  for (const style of sortedStyles) {
    for (const c of style.colors) {
      totalOld   += c.calcOld ?? 0; totalNew += c.calcNew ?? 0
      totalL += c.l; totalM += c.m; totalN += c.n
      totalStock += (c.l - c.m); totalColors++
    }
  }

  const globalStrategy: Strategy | null = useMemo(() => {
    if (styles.length === 0) return 3
    const first = styles[0].strategy
    return styles.every(s => s.strategy === first) ? first : null
  }, [styles])

  const update = useCallback(
    (styleId: string, colorId: string, field: 'n' | 's' | 't' | 'r' | 'aj' | 'weight', value: number) =>
      updateColorField(styleId, colorId, field, value),
    [updateColorField]
  )

  function handleExcelCopy() {
    const header = ['스타일', '컬러', 'PLC', '누적입량', '소진율%', '분배매장', '주판량', '주판율%', '원가율', '현재재고', '생산정보', '판매기간', '가중치', '기존제안', '신규제안']
    const rows = [header]
    for (const style of sortedStyles) {
      for (const c of style.colors) {
        const stock  = c.l - c.m
        const soreal = c.l > 0 ? (c.m / c.l * 100).toFixed(1) : ''
        const qPct   = stock > 0 ? (c.n / stock * 100).toFixed(1) : ''
        rows.push([style.code, c.color_name, style.plc, String(c.l), soreal, '—', String(c.n), qPct, '—', String(stock), '—', String(c.s), c.weight.toFixed(1) + 'x', String(c.calcOld ?? ''), String(c.calcNew ?? '')])
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

      {/* 헤더 */}
      <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between shrink-0">
        <div>
          <div className="text-base font-bold text-slate-800">계산 결과</div>
          <div className="text-sm text-slate-500 mt-0.5">
            {sortedStyles.length}개 스타일 · {totalColors}개 컬러
            {sessionLabel && <span className="ml-2 text-slate-400">· {sessionLabel}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExcelCopy} className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            <Copy className="w-3.5 h-3.5" />엑셀 복사
          </button>
          <button onClick={() => setConfirmModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded hover:bg-blue-700 transition-colors">
            <CheckCircle className="w-3.5 h-3.5" />발주 확정
          </button>
        </div>
      </div>

      {/* 전략 바 */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center gap-2 shrink-0">
        <span className="text-sm text-slate-500 font-semibold shrink-0">스타일별 발주 성향</span>
        <div className="flex items-center gap-1">
          {STRATEGY_LEVELS.map(lv => {
            const isActive = globalStrategy === lv
            const color = STRATEGY_COLORS[lv]
            return (
              <button key={lv} onClick={() => setAllStrategies(lv)}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-sm font-semibold border transition-all"
                style={isActive ? { background: color, borderColor: color, color: '#fff' } : { background: '#fff', borderColor: '#e2e8f0', color: '#475569' }}
              >
                {isActive && <span className="inline-block w-1.5 h-1.5 rounded-full bg-white opacity-90" />}
                {STRATEGY_LABELS[lv]}{lv === 3 ? ' 기본값' : ''}
              </button>
            )
          })}
        </div>
      </div>

      {/* 필터 바 */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2 shrink-0 flex-wrap">
        <span className="text-sm text-slate-500 font-semibold shrink-0">필터</span>
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

      {/* 테이블 */}
      {sortedStyles.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-slate-400 py-16">
          <div className="text-3xl mb-2">🔍</div>
          <div className="text-base">조건에 맞는 스타일이 없습니다.</div>
          <button onClick={() => { setYearFilter('all'); setSeasonFilter('all'); setBadgeFilter('all'); setItemFilter('all'); setQtyFilter('all') }}
            className="mt-2 text-sm text-blue-500 underline">필터 초기화</button>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="border-collapse bg-white text-sm" style={{ minWidth: 1480 }}>
            <colgroup>
              <col style={{ width: 230 }} />{/* 스타일 */}
              <col style={{ width: 100 }} />{/* 컬러 */}
              {/* 판매 현황 7 */}
              <col style={{ width: 78 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 68 }} />
              <col style={{ width: 78 }} />
              <col style={{ width: 68 }} />
              <col style={{ width: 68 }} />
              <col style={{ width: 78 }} />
              {/* 생산정보 1 */}
              <col style={{ width: 85 }} />
              {/* 발주설정 3 */}
              <col style={{ width: 92 }} />
              <col style={{ width: 78 }} />
              <col style={{ width: 78 }} />
              {/* 기존로직 1 */}
              <col style={{ width: 92 }} />
              {/* 신규로직 1 */}
              <col style={{ width: 110 }} />
            </colgroup>

            <thead className="sticky top-0 z-20">
              <tr className="text-white text-sm">
                <th rowSpan={2} className="px-3 py-2 text-left align-bottom bg-slate-800 border-r border-slate-600">
                  스타일
                  <SortIcon field="code" current={sortField} dir={sortDir} onClick={toggleSort} />
                </th>
                <th rowSpan={2} className="px-2 py-2 text-left align-bottom bg-slate-800">컬러</th>
                <th colSpan={7} className="px-2 pt-2 pb-1 text-center font-bold bg-slate-700 border-l-2 border-slate-600">판매 현황</th>
                <th colSpan={1} className="px-2 pt-2 pb-1 text-center font-bold bg-slate-600 border-l-2 border-slate-500">생산 정보</th>
                <th colSpan={3} className="px-2 pt-2 pb-1 text-center font-bold bg-slate-500 border-l-2 border-slate-400">발주 설정</th>
                <th colSpan={1} className="px-2 pt-2 pb-1 text-center font-bold border-l-2 border-slate-600" style={{ background: '#334155' }}>기존 로직</th>
                <th colSpan={1} className="px-2 pt-2 pb-1 text-center font-bold border-l-2 border-slate-700" style={{ background: '#1e3a5f' }}>신규 로직 (PLC 보정)</th>
              </tr>
              <tr className="text-slate-200 text-xs">
                {/* 판매 현황 */}
                <ColTh bg="bg-slate-700" border field="sumL" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>누적입량<Tip t="누적 입고 수량" /></ColTh>
                <ColTh bg="bg-slate-700" field="soreal" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>소진율<Tip t="누적판매 ÷ 누적입고 × 100%" /></ColTh>
                <th className="px-1 pb-1.5 text-center bg-slate-700">분배매장<Tip t="현재 분배 매장 수" /></th>
                <ColTh bg="bg-slate-700" field="sumN" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>주판량<Tip t="주간 평균 판매량 (수정 가능)" /></ColTh>
                <ColTh bg="bg-slate-700" field="qPct" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>주판율<Tip t="주판량 ÷ 현재재고 × 100%. 10%↑ 빨강" /></ColTh>
                <th className="px-1 pb-1.5 text-center bg-slate-700">원가율<Tip t="원가 / 정가 비율" /></th>
                <ColTh bg="bg-slate-700" field="sumStock" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>현재재고<Tip t="입고 - 누적판매" /></ColTh>
                {/* 생산정보 */}
                <th className="px-1 pb-1.5 text-center bg-slate-600 border-l-2 border-slate-500">생산정보</th>
                {/* 발주설정 */}
                <th className="px-1 pb-1.5 text-center bg-slate-500 border-l-2 border-slate-400">전년/T<Tip t="전년 유사상품 선택 → T값 반영" /></th>
                <th className="px-1 pb-1.5 text-center bg-slate-500">판매기간<Tip t="잔여 판매 기간(주). 기본 5주" /></th>
                <th className="px-1 pb-1.5 text-center bg-slate-500">가중치<Tip t="발주 수량 조정 계수. 기본 1.0배" /></th>
                {/* 기존로직 */}
                <ColTh field="sumOld" sortField={sortField} sortDir={sortDir} onSort={toggleSort}
                  className="border-l-2 border-slate-600" style={{ background: '#334155' }}>
                  제안수량<Tip t="W=0.3 고정 기존 로직 (pcs)" />
                </ColTh>
                {/* 신규로직 */}
                <ColTh field="sumNew" sortField={sortField} sortDir={sortDir} onSort={toggleSort}
                  className="border-l-2 border-slate-700" style={{ background: '#1e3a5f' }}>
                  제안수량<Tip t="PLC 보정 신규 로직 (pcs). % = 기존 대비" />
                </ColTh>
              </tr>
              <tr><td colSpan={15} className="p-0 h-0.5 bg-slate-900" /></tr>
            </thead>

            <tbody>
              {sortedStyles.map(style => (
                <StyleRows key={style.id} style={style} onTModal={(c, s) => setTModal({ open: true, color: c, style: s })} onUpdate={update} />
              ))}
              <GrandTotalRow styles={sortedStyles} totalL={totalL} totalM={totalM} totalN={totalN} totalStock={totalStock} totalOld={totalOld} totalNew={totalNew} />
            </tbody>
          </table>
        </div>
      )}

      {/* 하단 서머리 */}
      <div className="bg-slate-900 text-white px-4 py-2.5 flex items-center gap-6 text-sm shrink-0">
        <span className="text-slate-400 font-medium shrink-0">스타일: {sortedStyles.length}개</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="w-2 h-2 rounded-full bg-slate-400" />
          <span className="text-slate-400">기존 로직:</span>
          <span className="font-bold tabular-nums">{totalOld.toLocaleString()} pcs</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="w-2 h-2 rounded-full bg-blue-400" />
          <span className="text-slate-400">신규 로직:</span>
          <span className="font-bold text-blue-400 tabular-nums">{totalNew.toLocaleString()} pcs</span>
          {totalOld > 0 && (
            <span className={cn('text-xs tabular-nums', totalNew > totalOld ? 'text-red-400' : 'text-blue-400')}>
              ({totalNew > totalOld ? '▲' : '▼'}{Math.abs((totalNew - totalOld) / totalOld * 100).toFixed(1)}%)
            </span>
          )}
        </div>
        <button className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-sm transition-colors shrink-0">
          💾 저장
        </button>
      </div>

      {/* TModal */}
      {tModal.open && tModal.color && tModal.style && (
        <TModal open={tModal.open} onClose={() => setTModal({ open: false, color: null, style: null })} color={tModal.color} style={tModal.style} />
      )}

      {/* 발주 확정 모달 */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl w-80 p-6" style={{ fontFamily: GOTHIC }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800">발주 확정</h3>
              <button onClick={() => setConfirmModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 mb-4 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">스타일 수</span><span className="font-semibold">{sortedStyles.length}개</span></div>
              <div className="flex justify-between"><span className="text-slate-500">신규 로직 합계</span><span className="font-bold text-blue-700">{totalNew.toLocaleString()} pcs</span></div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmModal(false)} className="px-4 py-1.5 rounded border border-slate-300 text-sm text-slate-600 hover:bg-slate-50">취소</button>
              <button onClick={() => { setConfirmModal(false); toast.success('발주가 확정되었습니다.', { description: `총 ${totalNew.toLocaleString()} pcs · ${sortedStyles.length}개 스타일` }) }}
                className="px-4 py-1.5 rounded bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">확정</button>
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
  onUpdate: (sid: string, cid: string, f: 'n' | 's' | 't' | 'r' | 'aj' | 'weight', v: number) => void
}) {
  const colorCount   = style.colors.length
  const statusBadges = getStatusBadges(style)
  const { year, season, item } = parseStyleCode(style.code)

  return (
    <>
      {style.colors.map((color, ci) => {
        const inactive = color.l === 0
        const { calcOld, calcNew, delta } = color
        const stock  = color.l - color.m
        const soreal = color.l > 0 ? color.m / color.l * 100 : null
        const qPct   = stock > 0 ? color.n / stock * 100 : null

        const qCls = qPct == null ? 'text-slate-400'
          : qPct >= 10 ? 'text-red-600 font-bold'
          : qPct >= 7  ? 'text-amber-600 font-semibold'
          : 'text-slate-600'

        const deltaCls = delta == null ? ''
          : delta > 5  ? 'text-orange-500'
          : delta < -5 ? 'text-blue-400'
          : 'text-slate-400'

        return (
          <tr key={color.id} className={cn('border-b border-slate-100 hover:bg-slate-50/60 transition-colors', inactive && 'opacity-40')}>

            {/* 스타일 셀 */}
            {ci === 0 && (
              <td className="px-2 py-2 align-top border-r border-slate-200 bg-white" rowSpan={colorCount}>
                <div className="flex gap-2">
                  {/* 이미지 */}
                  <div className="w-14 h-[72px] shrink-0 border-2 border-dashed border-slate-200 rounded-md flex items-center justify-center text-xs text-slate-300 font-bold bg-slate-50 select-none">
                    IMG
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    {/* 스타일 코드 */}
                    <div className="font-mono text-sm font-bold text-slate-800 leading-tight">{style.code}</div>

                    {/* 파싱 칩: 연도/시즌/아이템 */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {year  && <span className="text-xs px-1.5 py-0 rounded bg-slate-100 text-slate-600 border border-slate-200 font-semibold leading-5">{year}</span>}
                      {season && <span className="text-xs px-1.5 py-0 rounded bg-slate-100 text-slate-600 border border-slate-200 font-semibold leading-5">{season}시즌</span>}
                      {item  && <span className="text-xs px-1.5 py-0 rounded bg-slate-100 text-slate-600 border border-slate-200 font-semibold leading-5">{item}</span>}
                    </div>

                    {/* 카테고리 뱃지 */}
                    {style.badges.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {style.badges.map(b => (
                          <span key={b} className={cn('text-xs px-1.5 py-0 rounded border font-semibold leading-5', STYLE_BADGE_COLORS[b])}>
                            {STYLE_BADGE_LABELS[b]}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* 상태 배지 */}
                    {statusBadges.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {statusBadges.map((b, i) => (
                          <span key={i} className={cn('text-xs px-1.5 py-0 rounded border font-semibold leading-5', b.cls)}>
                            {b.label}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* 가격/일수/매장/담당 */}
                    <div className="text-xs text-slate-400 leading-tight">
                      ₩{style.price.toLocaleString()} · {style.days_since_inbound}일 · {style.stores}매장 · {colorCount}컬러
                    </div>
                    <div className="text-xs text-slate-300 leading-tight">담당기획: —</div>

                    {/* 전략 */}
                    <div className="pt-1 border-t border-slate-100">
                      <StrategySelector styleId={style.id} strategy={style.strategy} />
                    </div>
                    <button onClick={() => onTModal(style.colors[0], style)} className="text-xs text-blue-600 underline hover:text-blue-800">
                      전년 유사상품 선택
                    </button>
                  </div>
                </div>
              </td>
            )}

            {/* 컬러 */}
            <td className="px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                {color.color_hex && <span className="w-3 h-3 rounded-full border border-black/10 shrink-0" style={{ background: color.color_hex }} />}
                <span className="text-sm text-slate-700 truncate">{color.color_name}</span>
              </div>
              {ci === 0 && <PlcBadge plc={style.plc} />}
            </td>

            {/* 누적입량 */}
            <td className="px-2 py-1 text-right tabular-nums text-sm text-slate-600 border-l-2 border-slate-100">{fmt(color.l)}</td>

            {/* 소진율 */}
            <td className={cn('px-2 py-1 text-right tabular-nums text-sm', soreal == null ? 'text-slate-400' : soreal >= 70 ? 'text-emerald-600 font-semibold' : 'text-slate-600')}>
              {soreal != null ? soreal.toFixed(1) + '%' : '—'}
            </td>

            {/* 분배매장 */}
            <td className="px-2 py-1 text-center text-xs text-slate-400">—</td>

            {/* 주판량 */}
            <td className="px-1.5 py-1">
              <InlineNumberInput value={color.n} onChange={v => onUpdate(style.id, color.id, 'n', v)} min={0} disabled={inactive} />
            </td>

            {/* 주판율 */}
            <td className={cn('px-2 py-1 text-right tabular-nums text-sm', qCls)}>
              {qPct != null ? qPct.toFixed(1) + '%' : '—'}
            </td>

            {/* 원가율 */}
            <td className="px-2 py-1 text-center text-xs text-slate-400">—</td>

            {/* 현재재고 */}
            <td className="px-2 py-1 text-right tabular-nums text-sm text-slate-600">{inactive ? '—' : stock.toLocaleString()}</td>

            {/* 생산정보 */}
            <td className="px-2 py-1 text-center text-xs text-slate-400 border-l-2 border-slate-100">—</td>

            {/* 전년/T */}
            <td className="px-1.5 py-1 border-l-2 border-slate-200">
              <button onClick={() => onTModal(color, style)} disabled={inactive}
                className="w-full px-1.5 py-1 rounded text-xs font-semibold text-white transition-colors disabled:opacity-40 disabled:pointer-events-none"
                style={{ background: '#334155' }}>
                전년상품 선택
              </button>
            </td>

            {/* 판매기간 */}
            <td className="px-1.5 py-1">
              <div className="flex items-center gap-1">
                <InlineNumberInput value={color.s} onChange={v => onUpdate(style.id, color.id, 's', v)} min={1} max={52} disabled={inactive} />
                <span className="text-xs text-slate-400 shrink-0">주</span>
              </div>
            </td>

            {/* 가중치 */}
            <td className="px-1 py-1">
              <select value={color.weight ?? 1.0} onChange={e => onUpdate(style.id, color.id, 'weight', parseFloat(e.target.value))} disabled={inactive}
                className="w-full text-xs border border-slate-200 rounded px-1 py-0.5 text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-40">
                {WEIGHT_OPTIONS.map(w => <option key={w} value={w}>{w.toFixed(1)}x</option>)}
              </select>
            </td>

            {/* 기존로직 */}
            <td className={cn('px-2 py-1 text-right tabular-nums font-semibold text-sm border-l-2 border-slate-200', inactive ? 'text-slate-300' : 'bg-slate-50 text-slate-600')}>
              {inactive ? '—' : fmt(calcOld)}
            </td>

            {/* 신규로직 */}
            <td className={cn('px-2 py-1 border-l-2 border-slate-200', !inactive && 'bg-blue-50')}>
              <div className={cn('text-right tabular-nums font-bold text-sm', inactive ? 'text-slate-300' : 'text-blue-700')}>
                {inactive ? '—' : fmt(calcNew)}
              </div>
              {!inactive && delta != null && (
                <div className={cn('text-xs tabular-nums text-right leading-tight', deltaCls)}>
                  {delta >= 0 ? '▲' : '▼'}{Math.abs(delta).toFixed(1)}% vs 기존
                </div>
              )}
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
  let sumOld = 0, sumNew = 0, sumL = 0, sumM = 0, sumN = 0, sumStock = 0
  let hasOld = false, hasNew = false
  for (const c of style.colors) {
    if (c.calcOld != null) { sumOld += c.calcOld; hasOld = true }
    if (c.calcNew != null) { sumNew += c.calcNew; hasNew = true }
    sumL += c.l; sumM += c.m; sumN += c.n; sumStock += (c.l - c.m)
  }
  const delta  = hasOld && sumOld > 0 ? ((sumNew - sumOld) / sumOld) * 100 : null
  const soreal = sumL > 0 ? sumM / sumL * 100 : null
  const qPct   = sumStock > 0 ? sumN / sumStock * 100 : null

  return (
    <tr className="border-t-2 border-b-2 border-slate-300 text-sm font-semibold" style={{ background: '#f1f5f9' }}>
      <td colSpan={2} className="px-3 py-1.5 text-slate-500 text-xs font-semibold">{style.colors.length}컬러 합계</td>
      {/* 누적입량 */}
      <td className="px-2 py-1 text-right tabular-nums text-slate-700 border-l-2 border-slate-200">{sumL.toLocaleString()}</td>
      {/* 소진율 */}
      <td className="px-2 py-1 text-right tabular-nums text-slate-600">{soreal != null ? soreal.toFixed(1) + '%' : '—'}</td>
      {/* 분배매장 */}
      <td />
      {/* 주판량 */}
      <td className="px-2 py-1 text-right tabular-nums text-slate-700">{sumN.toLocaleString()}</td>
      {/* 주판율 */}
      <td className="px-2 py-1 text-right tabular-nums text-slate-600">{qPct != null ? qPct.toFixed(1) + '%' : '—'}</td>
      {/* 원가율 */}
      <td />
      {/* 현재재고 */}
      <td className="px-2 py-1 text-right tabular-nums text-slate-700">{sumStock.toLocaleString()}</td>
      {/* 생산정보 */}
      <td className="border-l-2 border-slate-200" />
      {/* 전년T/판매기간/가중치 */}
      <td className="border-l-2 border-slate-200" /><td /><td />
      {/* 기존 */}
      <td className="px-2 py-1 text-right tabular-nums border-l-2 border-slate-200 bg-slate-200 text-slate-700">{hasOld ? sumOld.toLocaleString() : '—'}</td>
      {/* 신규 */}
      <td className="px-2 py-1 border-l-2 border-slate-200 bg-blue-100">
        <div className="text-right tabular-nums text-blue-800">{hasNew ? sumNew.toLocaleString() : '—'}</div>
        {delta != null && (
          <div className={cn('text-xs tabular-nums text-right leading-tight', delta > 5 ? 'text-orange-500' : delta < -5 ? 'text-blue-500' : 'text-slate-400')}>
            {delta >= 0 ? '▲' : '▼'}{Math.abs(delta).toFixed(1)}% vs 기존
          </div>
        )}
      </td>
    </tr>
  )
}

// ─── 전체 합계 ────────────────────────────────────────────
function GrandTotalRow({ styles, totalL, totalM, totalN, totalStock, totalOld, totalNew }: {
  styles: StyleRow[]; totalL: number; totalM: number; totalN: number; totalStock: number; totalOld: number; totalNew: number
}) {
  const soreal = totalL > 0 ? totalM / totalL * 100 : null
  const qPct   = totalStock > 0 ? totalN / totalStock * 100 : null
  const delta  = totalOld > 0 ? ((totalNew - totalOld) / totalOld * 100) : null

  return (
    <tr className="border-t-4 border-slate-400 text-sm font-bold" style={{ background: '#e2e8f0' }}>
      <td colSpan={2} className="px-3 py-2 text-slate-700">전체 합계 ({styles.length}개 스타일)</td>
      <td className="px-2 py-2 text-right tabular-nums text-slate-800 border-l-2 border-slate-300">{totalL.toLocaleString()}</td>
      <td className="px-2 py-2 text-right tabular-nums text-slate-700">{soreal != null ? soreal.toFixed(1) + '%' : '—'}</td>
      <td />
      <td className="px-2 py-2 text-right tabular-nums text-slate-800">{totalN.toLocaleString()}</td>
      <td className="px-2 py-2 text-right tabular-nums text-slate-700">{qPct != null ? qPct.toFixed(1) + '%' : '—'}</td>
      <td />
      <td className="px-2 py-2 text-right tabular-nums text-slate-800">{totalStock.toLocaleString()}</td>
      <td className="border-l-2 border-slate-300" />
      <td className="border-l-2 border-slate-300" /><td /><td />
      <td className="px-2 py-2 text-right tabular-nums border-l-2 border-slate-300 bg-slate-300 text-slate-800">{totalOld > 0 ? totalOld.toLocaleString() : '—'}</td>
      <td className="px-2 py-2 border-l-2 border-slate-300 bg-blue-200">
        <div className="text-right tabular-nums text-blue-900">{totalNew > 0 ? totalNew.toLocaleString() : '—'}</div>
        {delta != null && (
          <div className={cn('text-xs tabular-nums text-right leading-tight', delta > 5 ? 'text-orange-600' : delta < -5 ? 'text-blue-600' : 'text-slate-500')}>
            {delta >= 0 ? '▲' : '▼'}{Math.abs(delta).toFixed(1)}% vs 기존
          </div>
        )}
      </td>
    </tr>
  )
}

// ─── 헬퍼 컴포넌트 ────────────────────────────────────────
function Fsel({ label, value, onChange, children }: {
  label: string; value: string; onChange: (v: string) => void; children: React.ReactNode
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="text-sm border border-slate-200 rounded px-2 py-1 bg-white text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-400"
      aria-label={label}>
      {children}
    </select>
  )
}

function ColTh({ field, sortField, sortDir, onSort, children, bg, border, className, style }: {
  field: string; sortField: string | null; sortDir: 'asc' | 'desc'
  onSort: (f: string) => void; children: React.ReactNode
  bg?: string; border?: boolean; className?: string; style?: React.CSSProperties
}) {
  const active = sortField === field
  return (
    <th
      onClick={() => onSort(field)}
      className={cn('px-1 pb-1.5 text-center whitespace-nowrap cursor-pointer select-none hover:opacity-80 transition-opacity', bg, border && 'border-l-2 border-slate-500', className)}
      style={style}
    >
      <span className="inline-flex items-center gap-0.5">
        {children}
        {active ? (
          sortDir === 'asc' ? <ArrowUp className="w-3 h-3 inline" /> : <ArrowDown className="w-3 h-3 inline" />
        ) : (
          <ArrowUpDown className="w-3 h-3 inline opacity-40" />
        )}
      </span>
    </th>
  )
}

function SortIcon({ field, current, dir, onClick }: { field: string; current: string | null; dir: 'asc' | 'desc'; onClick: (f: string) => void }) {
  const active = current === field
  return (
    <span onClick={e => { e.stopPropagation(); onClick(field) }} className="ml-1 cursor-pointer inline-flex align-middle opacity-60 hover:opacity-100">
      {active ? (dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3" />}
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
  return <span className={cn('text-xs px-1.5 py-0 rounded border font-semibold leading-5 mt-0.5 inline-block', map[plc] ?? '')}>{plc}</span>
}

function Tip({ t }: { t: string }) {
  return (
    <span className="relative group inline-flex items-center ml-0.5 align-middle">
      <span className="text-[9px] text-slate-400 group-hover:text-slate-200 cursor-help select-none">ℹ</span>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-44 bg-slate-900 text-slate-100 text-xs rounded px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-normal text-center leading-relaxed shadow-xl border border-slate-700">
        {t}
      </span>
    </span>
  )
}
