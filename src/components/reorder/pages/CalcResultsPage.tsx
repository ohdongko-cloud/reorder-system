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
import { CheckCircle, X, Copy } from 'lucide-react'
import type { ColorRow, StyleRow, PlcStage, Strategy, StyleBadge } from '@/types/reorder'

// ── 한국어 고딕 폰트 스택
const GOTHIC_FONT = "'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif"

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString()
}

interface TModalState {
  open: boolean
  color: ColorRow | null
  style: StyleRow | null
}

const STRATEGY_LEVELS: Strategy[] = [1, 2, 3, 4, 5]

// ── 가중치 옵션: 1.0, 1.1 … 2.0
const WEIGHT_OPTIONS = Array.from({ length: 11 }, (_, i) => parseFloat((1.0 + i * 0.1).toFixed(1)))

export function CalcResultsPage() {
  const styles           = useReorderStore(s => s.styles)
  const updateColorField = useReorderStore(s => s.updateColorField)
  const setAllStrategies = useReorderStore(s => s.setAllStrategies)
  const currentSession   = useReorderStore(s => s.currentSession)

  // ── 필터 상태
  const [yearFilter,    setYearFilter]    = useState<string>('all')
  const [seasonFilter,  setSeasonFilter]  = useState<string>('all')
  const [badgeFilter,   setBadgeFilter]   = useState<string>('all')
  const [itemFilter,    setItemFilter]    = useState<string>('all')
  const [plannerFilter, setPlannerFilter] = useState<string>('all')
  const [factoryFilter, setFactoryFilter] = useState<string>('all')
  const [qtyFilter,     setQtyFilter]     = useState<'300+' | 'all'>('300+')

  const [tModal,        setTModal]        = useState<TModalState>({ open: false, color: null, style: null })
  const [confirmModal,  setConfirmModal]  = useState(false)

  // ── 스타일코드에서 연도·시즌·아이템 추출 (필터용 고유값)
  const uniqueYears = useMemo(() => {
    const s = new Set<string>()
    styles.forEach(st => {
      const { year } = parseStyleCode(st.code)
      if (year) s.add(String(year))
    })
    return Array.from(s).sort((a, b) => Number(b) - Number(a))
  }, [styles])

  const uniqueItems = useMemo(() => {
    const s = new Set<string>()
    styles.forEach(st => {
      const { item } = parseStyleCode(st.code)
      if (item && item.trim()) s.add(item)
    })
    return Array.from(s).sort()
  }, [styles])

  // ── 필터링된 스타일
  const filteredStyles = useMemo(() => {
    return styles.filter(style => {
      const { year, season, item } = parseStyleCode(style.code)
      if (yearFilter   !== 'all' && String(year) !== yearFilter)              return false
      if (seasonFilter !== 'all' && String(season) !== seasonFilter)           return false
      if (badgeFilter  !== 'all' && !style.badges.includes(badgeFilter as StyleBadge)) return false
      if (itemFilter   !== 'all' && item !== itemFilter)                       return false
      if (qtyFilter    === '300+' && !style.colors.some(c => (c.calcNew ?? 0) >= MIN_RECOMMEND_QTY)) return false
      return true
    })
  }, [styles, yearFilter, seasonFilter, badgeFilter, itemFilter, qtyFilter])

  // ── 집계
  let totalOld = 0, totalNew = 0, totalK = 0, totalL = 0, totalM = 0, totalN = 0, totalStock = 0, totalColors = 0
  for (const style of filteredStyles) {
    for (const c of style.colors) {
      totalOld   += c.calcOld ?? 0
      totalNew   += c.calcNew ?? 0
      totalK     += c.k
      totalL     += c.l
      totalM     += c.m
      totalN     += c.n
      totalStock += (c.l - c.m)
      totalColors++
    }
  }

  const globalStrategy: Strategy | null = useMemo(() => {
    if (styles.length === 0) return 3
    const first = styles[0].strategy
    return styles.every(s => s.strategy === first) ? first : null
  }, [styles])

  const update = useCallback(
    (styleId: string, colorId: string, field: 'n' | 's' | 't' | 'r' | 'aj' | 'weight', value: number) => {
      updateColorField(styleId, colorId, field, value)
    },
    [updateColorField]
  )

  function openTModal(color: ColorRow, style: StyleRow) {
    setTModal({ open: true, color, style })
  }

  function handleExcelCopy() {
    const header = ['스타일', '컬러', 'PLC', '담당기획', '누적발주', '누적입고', '소진율%', '주판량', '주판율%', '현재재고', '판매기간', '가중치', '기존제안', '신규제안']
    const rows: string[][] = [header]
    for (const style of filteredStyles) {
      for (const color of style.colors) {
        const stock   = color.l - color.m
        const soreal  = color.l > 0 ? (color.m / color.l * 100).toFixed(1) : ''
        const qPct    = stock > 0 ? (color.n / stock * 100).toFixed(1) : ''
        rows.push([
          style.code, color.color_name, style.plc,
          '—', String(color.k), String(color.l),
          soreal, String(color.n), qPct, String(stock),
          String(color.s), color.weight.toFixed(1) + 'x',
          String(color.calcOld ?? ''), String(color.calcNew ?? ''),
        ])
      }
    }
    navigator.clipboard.writeText(rows.map(r => r.join('\t')).join('\n'))
      .then(() => toast.success('클립보드에 복사됐습니다'))
      .catch(() => toast.error('복사 실패'))
  }

  const sessionDateDisplay = currentSession
    ? `${currentSession.name} (${getWeekRange(currentSession.base_date)})`
    : null

  if (styles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 text-slate-400 py-24" style={{ fontFamily: GOTHIC_FONT }}>
        <div className="text-4xl mb-3">📊</div>
        <div className="text-sm">300장 이상 추천되는 스타일이 없습니다.</div>
        <div className="text-xs mt-1 text-slate-300">엑셀 파일을 업로드하면 자동으로 계산됩니다.</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ fontFamily: GOTHIC_FONT }}>

      {/* ── 헤더 바 ── */}
      <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between shrink-0">
        <div>
          <div className="text-base font-bold text-slate-800">계산 결과</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {filteredStyles.length}개 스타일 · {totalColors}개 컬러
            {sessionDateDisplay && <span className="ml-2 text-slate-400">· {sessionDateDisplay}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExcelCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />엑셀 복사
          </button>
          <button
            onClick={() => setConfirmModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded hover:bg-blue-700 transition-colors"
          >
            <CheckCircle className="w-3.5 h-3.5" />발주 확정
          </button>
        </div>
      </div>

      {/* ── 전략 바 ── */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center gap-2 shrink-0">
        <span className="text-xs text-slate-500 font-semibold shrink-0">스타일별 발주 성향</span>
        <div className="flex items-center gap-1">
          {STRATEGY_LEVELS.map(lv => {
            const isActive = globalStrategy === lv
            const color = STRATEGY_COLORS[lv]
            return (
              <button
                key={lv}
                onClick={() => setAllStrategies(lv)}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold border transition-all"
                style={isActive
                  ? { background: color, borderColor: color, color: '#fff' }
                  : { background: '#fff', borderColor: '#e2e8f0', color: '#475569' }
                }
              >
                {isActive && <span className="inline-block w-1.5 h-1.5 rounded-full bg-white opacity-90" />}
                {STRATEGY_LABELS[lv]}{lv === 3 ? ' 기본값' : ''}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── 필터 바 ── */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2 shrink-0 flex-wrap">
        <span className="text-xs text-slate-500 font-semibold shrink-0">필터</span>

        {/* 연도 */}
        <FilterSelect label="연도" value={yearFilter} onChange={setYearFilter}>
          <option value="all">전체 연도</option>
          {uniqueYears.map(y => <option key={y} value={y}>{y}</option>)}
        </FilterSelect>

        {/* 시즌 */}
        <FilterSelect label="시즌" value={seasonFilter} onChange={setSeasonFilter}>
          <option value="all">전체 시즌</option>
          {[1, 2, 3, 4].map(s => <option key={s} value={String(s)}>{s}시즌</option>)}
        </FilterSelect>

        {/* 구분(뱃지) */}
        <FilterSelect label="구분" value={badgeFilter} onChange={setBadgeFilter}>
          <option value="all">전체 구분</option>
          <option value="carryover">캐리오버</option>
          <option value="qr_test">QR테스트</option>
          <option value="re">RE</option>
        </FilterSelect>

        {/* 아이템 */}
        <FilterSelect label="아이템" value={itemFilter} onChange={setItemFilter}>
          <option value="all">전체 아이템</option>
          {uniqueItems.map(i => <option key={i} value={i}>{i}</option>)}
        </FilterSelect>

        {/* 담당 기획 (TBD) */}
        <FilterSelect label="담당기획" value={plannerFilter} onChange={setPlannerFilter}>
          <option value="all">전체 기획자</option>
        </FilterSelect>

        {/* 공장 (TBD) */}
        <FilterSelect label="공장" value={factoryFilter} onChange={setFactoryFilter}>
          <option value="all">전체 공장</option>
        </FilterSelect>

        {/* 추천 수량 */}
        <div className="ml-auto">
          <FilterSelect label="추천수량" value={qtyFilter} onChange={v => setQtyFilter(v as '300+' | 'all')}>
            <option value="300+">≥{MIN_RECOMMEND_QTY}장 (추천 대상)</option>
            <option value="all">전체 보기</option>
          </FilterSelect>
        </div>
      </div>

      {/* ── 테이블 ── */}
      {filteredStyles.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-slate-400 py-16">
          <div className="text-3xl mb-2">🔍</div>
          <div className="text-sm">조건에 맞는 스타일이 없습니다.</div>
          <button
            onClick={() => {
              setYearFilter('all'); setSeasonFilter('all'); setBadgeFilter('all')
              setItemFilter('all'); setQtyFilter('all')
            }}
            className="mt-2 text-sm text-blue-500 underline"
          >필터 초기화</button>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="border-collapse bg-white text-sm" style={{ minWidth: 1500 }}>
            <colgroup>
              <col style={{ width: 200 }} />{/* 스타일 */}
              <col style={{ width: 100 }} />{/* 컬러 */}
              {/* 판매 현황 (9) */}
              <col style={{ width: 65 }} />{/* 담당기획 */}
              <col style={{ width: 75 }} />{/* 누적발주 */}
              <col style={{ width: 75 }} />{/* 누적입고 */}
              <col style={{ width: 65 }} />{/* 소진율 */}
              <col style={{ width: 65 }} />{/* 분배매장 */}
              <col style={{ width: 78 }} />{/* 주판량 */}
              <col style={{ width: 68 }} />{/* 주판율 */}
              <col style={{ width: 65 }} />{/* 판가율 */}
              <col style={{ width: 75 }} />{/* 현재재고 */}
              {/* 생산정보 (1) */}
              <col style={{ width: 85 }} />
              {/* 발주 설정 (3) */}
              <col style={{ width: 92 }} />{/* 전년/T */}
              <col style={{ width: 80 }} />{/* 판매기간 */}
              <col style={{ width: 80 }} />{/* 가중치 */}
              {/* 기존 로직 (1) */}
              <col style={{ width: 90 }} />
              {/* 신규 로직 (1) */}
              <col style={{ width: 108 }} />
            </colgroup>

            <thead className="sticky top-0 z-20">
              {/* 그룹 헤더 1행 */}
              <tr className="text-white text-xs">
                <th rowSpan={2} className="px-3 py-2 text-left align-bottom bg-slate-800 border-r border-slate-600 whitespace-nowrap">
                  스타일
                </th>
                <th rowSpan={2} className="px-2 py-2 text-left align-bottom bg-slate-800 whitespace-nowrap">
                  컬러
                </th>
                <th colSpan={9} className="px-2 pt-2 pb-1 text-center font-bold bg-slate-700 border-l-2 border-slate-600">
                  판매 현황
                </th>
                <th colSpan={1} className="px-2 pt-2 pb-1 text-center font-bold bg-slate-600 border-l-2 border-slate-500">
                  생산 정보
                </th>
                <th colSpan={3} className="px-2 pt-2 pb-1 text-center font-bold bg-slate-500 border-l-2 border-slate-400">
                  발주 설정
                </th>
                <th colSpan={1} className="px-2 pt-2 pb-1 text-center font-bold border-l-2 border-slate-600" style={{ background: '#334155' }}>
                  기존 로직
                </th>
                <th colSpan={1} className="px-2 pt-2 pb-1 text-center font-bold border-l-2 border-slate-700" style={{ background: '#1e3a5f' }}>
                  신규 로직 (PLC 보정)
                </th>
              </tr>

              {/* 컬럼 레이블 2행 */}
              <tr className="text-slate-200 text-xs">
                {/* 판매 현황 */}
                <th className="px-1 pb-1.5 text-center bg-slate-700 border-l-2 border-slate-600 whitespace-nowrap">담당기획</th>
                <th className="px-1 pb-1.5 text-center bg-slate-700 whitespace-nowrap">누적발주<Tip text="누적 발주(생산) 수량" /></th>
                <th className="px-1 pb-1.5 text-center bg-slate-700 whitespace-nowrap">누적입고<Tip text="누적 입고 수량" /></th>
                <th className="px-1 pb-1.5 text-center bg-slate-700 whitespace-nowrap">소진율<Tip text="누적판매 ÷ 누적입고 × 100%" /></th>
                <th className="px-1 pb-1.5 text-center bg-slate-700 whitespace-nowrap">분배매장<Tip text="현재 분배된 매장 수" /></th>
                <th className="px-1 pb-1.5 text-center bg-slate-700 whitespace-nowrap">주판량<Tip text="주간 평균 판매량 (수정 가능)" /></th>
                <th className="px-1 pb-1.5 text-center bg-slate-700 whitespace-nowrap">주판율<Tip text="주판량 ÷ 현재재고 × 100%. 10%↑ 빨강" /></th>
                <th className="px-1 pb-1.5 text-center bg-slate-700 whitespace-nowrap">판가율<Tip text="판가 / 정가 비율" /></th>
                <th className="px-1 pb-1.5 text-center bg-slate-700 whitespace-nowrap">현재재고<Tip text="입고 - 누적판매" /></th>
                {/* 생산정보 */}
                <th className="px-1 pb-1.5 text-center bg-slate-600 border-l-2 border-slate-500 whitespace-nowrap">생산정보</th>
                {/* 발주 설정 */}
                <th className="px-1 pb-1.5 text-center bg-slate-500 border-l-2 border-slate-400 whitespace-nowrap">전년/T<Tip text="전년 유사상품 선택 시 T값 자동 반영" /></th>
                <th className="px-1 pb-1.5 text-center bg-slate-500 whitespace-nowrap">판매기간<Tip text="잔여 판매 기간(주). 기본 5주, 수정 가능" /></th>
                <th className="px-1 pb-1.5 text-center bg-slate-500 whitespace-nowrap">가중치<Tip text="발주 수량 조정 계수. 기본 1.0배" /></th>
                {/* 기존 로직 */}
                <th className="px-1 pb-1.5 text-center border-l-2 border-slate-600 whitespace-nowrap" style={{ background: '#334155' }}>
                  제안수량<Tip text="W=0.3 고정 기존 로직 추천 수량(pcs)" />
                </th>
                {/* 신규 로직 */}
                <th className="px-1 pb-1.5 text-center border-l-2 border-slate-700 whitespace-nowrap" style={{ background: '#1e3a5f' }}>
                  제안수량<Tip text="PLC 보정 신규 로직 추천 수량(pcs). % = 기존 대비 증감" />
                </th>
              </tr>

              {/* 구분선 */}
              <tr><td colSpan={17} className="p-0 h-0.5 bg-slate-900" /></tr>
            </thead>

            <tbody>
              {filteredStyles.map(style => (
                <StyleRows
                  key={style.id}
                  style={style}
                  onTModal={openTModal}
                  onUpdateColor={update}
                />
              ))}
              {/* 전체 합계 행 */}
              <GrandTotalRow
                styles={filteredStyles}
                totalK={totalK}
                totalL={totalL}
                totalM={totalM}
                totalN={totalN}
                totalStock={totalStock}
                totalOld={totalOld}
                totalNew={totalNew}
              />
            </tbody>
          </table>
        </div>
      )}

      {/* ── 하단 서머리 바 ── */}
      <div className="bg-slate-900 text-white px-4 py-2.5 flex items-center gap-6 text-sm shrink-0">
        <span className="text-slate-400 font-medium shrink-0">스타일: {filteredStyles.length}개</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
          <span className="text-slate-400">기존 로직:</span>
          <span className="font-bold tabular-nums">{totalOld.toLocaleString()} pcs</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
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

      {/* ── T Modal ── */}
      {tModal.open && tModal.color && tModal.style && (
        <TModal
          open={tModal.open}
          onClose={() => setTModal({ open: false, color: null, style: null })}
          color={tModal.color}
          style={tModal.style}
        />
      )}

      {/* ── 발주 확정 모달 ── */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl w-80 p-6" style={{ fontFamily: GOTHIC_FONT }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800">발주 확정</h3>
              <button onClick={() => setConfirmModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 mb-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">스타일 수</span>
                <span className="font-semibold">{filteredStyles.length}개</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">신규 로직 합계</span>
                <span className="font-bold text-blue-700">{totalNew.toLocaleString()} pcs</span>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmModal(false)} className="px-4 py-1.5 rounded border border-slate-300 text-sm text-slate-600 hover:bg-slate-50">취소</button>
              <button
                onClick={() => {
                  setConfirmModal(false)
                  toast.success('발주가 확정되었습니다.', { description: `총 ${totalNew.toLocaleString()} pcs · ${filteredStyles.length}개 스타일` })
                }}
                className="px-4 py-1.5 rounded bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
              >확정</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
//  StyleRows (per-style block)
// ─────────────────────────────────────────────────────────
function StyleRows({
  style,
  onTModal,
  onUpdateColor,
}: {
  style: StyleRow
  onTModal: (c: ColorRow, s: StyleRow) => void
  onUpdateColor: (styleId: string, colorId: string, field: 'n' | 's' | 't' | 'r' | 'aj' | 'weight', value: number) => void
}) {
  const colorCount = style.colors.length

  return (
    <>
      {style.colors.map((color, ci) => {
        const inactive = color.l === 0
        const { calcOld, calcNew, delta } = color

        const stock  = color.l - color.m
        const soreal = color.l > 0 ? color.m / color.l * 100 : null
        const qPct   = stock > 0 ? color.n / stock * 100 : null

        const qColor =
          qPct == null ? 'text-slate-400' :
          qPct >= 10   ? 'text-red-600 font-bold' :
          qPct >= 7    ? 'text-amber-600 font-semibold' :
          'text-slate-600'

        const deltaColor =
          delta == null ? '' :
          delta > 5     ? 'text-orange-500' :
          delta < -5    ? 'text-blue-400' :
          'text-slate-400'

        return (
          <tr
            key={color.id}
            className={cn(
              'border-b border-slate-100 hover:bg-slate-50/60 transition-colors',
              inactive && 'opacity-40'
            )}
          >
            {/* ── 스타일 셀 (rowSpan) ── */}
            {ci === 0 && (
              <td className="px-2 py-2 align-top border-r border-slate-200 bg-white" rowSpan={colorCount}>
                <div className="flex gap-2">
                  <div className="w-12 h-[52px] shrink-0 border-2 border-dashed border-slate-200 rounded flex items-center justify-center text-xs text-slate-300 font-bold bg-slate-50 select-none">
                    IMG
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="font-mono text-sm font-bold text-slate-800">{style.code}</span>
                    </div>
                    {/* 뱃지 */}
                    {style.badges.length > 0 && (
                      <div className="flex gap-1 flex-wrap mt-0.5">
                        {style.badges.map(b => (
                          <span key={b} className={cn('text-xs px-1.5 py-0 rounded border font-semibold leading-5', STYLE_BADGE_COLORS[b])}>
                            {STYLE_BADGE_LABELS[b]}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* 상품명 자리 (빈칸 — 추후 파싱) */}
                    <div className="h-[14px]" />
                    <div className="text-xs text-slate-400 leading-tight">
                      ₩{style.price.toLocaleString()} · {style.days_since_inbound}일 · {style.stores}매장
                    </div>
                    <div className="mt-1.5 pt-1 border-t border-slate-100">
                      <StrategySelector styleId={style.id} strategy={style.strategy} />
                    </div>
                    <button
                      onClick={() => onTModal(style.colors[0], style)}
                      className="text-xs text-blue-600 underline hover:text-blue-800 mt-0.5"
                    >전년 유사상품 선택</button>
                  </div>
                </div>
              </td>
            )}

            {/* 컬러 + PLC */}
            <td className="px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                {color.color_hex && (
                  <span className="w-2.5 h-2.5 rounded-full border border-black/10 shrink-0" style={{ background: color.color_hex }} />
                )}
                <span className="text-sm text-slate-700 truncate">{color.color_name}</span>
              </div>
              {ci === 0 && (
                <PlcBadge plc={style.plc} />
              )}
            </td>

            {/* 담당기획 */}
            <td className="px-2 py-1 text-center text-xs text-slate-400 border-l-2 border-slate-100">—</td>

            {/* 누적발주 (k) */}
            <td className="px-2 py-1 text-right tabular-nums text-sm text-slate-600">
              {fmt(color.k)}
            </td>

            {/* 누적입고 (l) */}
            <td className="px-2 py-1 text-right tabular-nums text-sm text-slate-600">
              {fmt(color.l)}
            </td>

            {/* 소진율 */}
            <td className={cn('px-2 py-1 text-right tabular-nums text-sm', soreal == null ? 'text-slate-400' : soreal >= 70 ? 'text-emerald-600 font-semibold' : 'text-slate-600')}>
              {soreal != null ? soreal.toFixed(1) + '%' : '—'}
            </td>

            {/* 분배매장 */}
            <td className="px-2 py-1 text-center text-xs text-slate-400">—</td>

            {/* 주판량 (N, editable) */}
            <td className="px-1.5 py-1">
              <InlineNumberInput value={color.n} onChange={v => onUpdateColor(style.id, color.id, 'n', v)} min={0} disabled={inactive} />
            </td>

            {/* 주판율 */}
            <td className={cn('px-2 py-1 text-right tabular-nums text-sm', qColor)}>
              {qPct != null ? qPct.toFixed(1) + '%' : '—'}
            </td>

            {/* 판가율 */}
            <td className="px-2 py-1 text-center text-xs text-slate-400">—</td>

            {/* 현재재고 */}
            <td className="px-2 py-1 text-right tabular-nums text-sm text-slate-600">
              {inactive ? '—' : stock.toLocaleString()}
            </td>

            {/* 생산정보 */}
            <td className="px-2 py-1 text-center text-xs text-slate-400 border-l-2 border-slate-100">—</td>

            {/* 전년/T 버튼 */}
            <td className="px-1.5 py-1 border-l-2 border-slate-200">
              <button
                onClick={() => onTModal(color, style)}
                disabled={inactive}
                className="w-full px-1.5 py-1 rounded text-xs font-semibold text-white transition-colors disabled:opacity-40 disabled:pointer-events-none"
                style={{ background: '#334155' }}
              >
                전년상품 선택
              </button>
            </td>

            {/* 판매기간 S (editable) */}
            <td className="px-1.5 py-1">
              <div className="flex items-center gap-1">
                <InlineNumberInput
                  value={color.s}
                  onChange={v => onUpdateColor(style.id, color.id, 's', v)}
                  min={1}
                  max={52}
                  disabled={inactive}
                />
                <span className="text-xs text-slate-400 shrink-0">주</span>
              </div>
            </td>

            {/* 가중치 (dropdown) */}
            <td className="px-1 py-1">
              <select
                value={color.weight ?? 1.0}
                onChange={e => onUpdateColor(style.id, color.id, 'weight', parseFloat(e.target.value))}
                disabled={inactive}
                className="w-full text-xs border border-slate-200 rounded px-1 py-0.5 text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-40"
              >
                {WEIGHT_OPTIONS.map(w => (
                  <option key={w} value={w}>{w.toFixed(1)}x</option>
                ))}
              </select>
            </td>

            {/* 기존 로직 제안 */}
            <td className={cn('px-2 py-1 text-right tabular-nums font-semibold text-sm border-l-2 border-slate-200', inactive ? 'text-slate-300' : 'bg-slate-50 text-slate-600')}>
              {inactive ? '—' : fmt(calcOld)}
            </td>

            {/* 신규 로직 제안 + delta */}
            <td className={cn('px-2 py-1 border-l-2 border-slate-200', !inactive && 'bg-blue-50')}>
              <div className={cn('text-right tabular-nums font-bold text-sm', inactive ? 'text-slate-300' : 'text-blue-700')}>
                {inactive ? '—' : fmt(calcNew)}
              </div>
              {!inactive && delta != null && (
                <div className={cn('text-xs tabular-nums text-right leading-tight', deltaColor)}>
                  {delta >= 0 ? '▲' : '▼'}{Math.abs(delta).toFixed(1)}% vs 기존
                </div>
              )}
            </td>
          </tr>
        )
      })}

      {/* 스타일 소계 행 */}
      <StyleSubtotalRow style={style} />
    </>
  )
}

// ─────────────────────────────────────────────────────────
//  스타일 소계 행
// ─────────────────────────────────────────────────────────
function StyleSubtotalRow({ style }: { style: StyleRow }) {
  let sumOld = 0, sumNew = 0, sumK = 0, sumL = 0, sumM = 0, sumN = 0, sumStock = 0
  let hasOld = false, hasNew = false
  for (const c of style.colors) {
    if (c.calcOld != null) { sumOld += c.calcOld; hasOld = true }
    if (c.calcNew != null) { sumNew += c.calcNew; hasNew = true }
    sumK += c.k; sumL += c.l; sumM += c.m; sumN += c.n; sumStock += (c.l - c.m)
  }
  const delta = hasOld && sumOld > 0 ? ((sumNew - sumOld) / sumOld) * 100 : null
  const soreal = sumL > 0 ? sumM / sumL * 100 : null
  const qPct   = sumStock > 0 ? sumN / sumStock * 100 : null

  return (
    <tr className="border-t-2 border-b-2 border-slate-300 text-sm font-semibold" style={{ background: '#f1f5f9' }}>
      <td colSpan={2} className="px-3 py-1.5 text-slate-500 text-xs font-semibold">
        {style.colors.length}컬러 합계
      </td>
      {/* 담당기획 */}
      <td className="border-l-2 border-slate-200" />
      {/* 누적발주 */}
      <td className="px-2 py-1 text-right tabular-nums text-slate-700">{sumK.toLocaleString()}</td>
      {/* 누적입고 */}
      <td className="px-2 py-1 text-right tabular-nums text-slate-700">{sumL.toLocaleString()}</td>
      {/* 소진율 */}
      <td className="px-2 py-1 text-right tabular-nums text-slate-600">
        {soreal != null ? soreal.toFixed(1) + '%' : '—'}
      </td>
      {/* 분배매장 */}
      <td />
      {/* 주판량 */}
      <td className="px-2 py-1 text-right tabular-nums text-slate-700">{sumN.toLocaleString()}</td>
      {/* 주판율 */}
      <td className="px-2 py-1 text-right tabular-nums text-slate-600">
        {qPct != null ? qPct.toFixed(1) + '%' : '—'}
      </td>
      {/* 판가율 */}
      <td />
      {/* 현재재고 */}
      <td className="px-2 py-1 text-right tabular-nums text-slate-700">{sumStock.toLocaleString()}</td>
      {/* 생산정보 */}
      <td className="border-l-2 border-slate-200" />
      {/* 전년/T, 판매기간, 가중치 */}
      <td className="border-l-2 border-slate-200" /><td /><td />
      {/* 기존 로직 */}
      <td className="px-2 py-1 text-right tabular-nums border-l-2 border-slate-200 bg-slate-200 text-slate-700">
        {hasOld ? sumOld.toLocaleString() : '—'}
      </td>
      {/* 신규 로직 */}
      <td className="px-2 py-1 border-l-2 border-slate-200 bg-blue-100">
        <div className="text-right tabular-nums text-blue-800">{hasNew ? sumNew.toLocaleString() : '—'}</div>
        {delta != null && (
          <div className={cn('text-xs tabular-nums text-right leading-tight',
            delta > 5 ? 'text-orange-500' : delta < -5 ? 'text-blue-500' : 'text-slate-400'
          )}>
            {delta >= 0 ? '▲' : '▼'}{Math.abs(delta).toFixed(1)}% vs 기존
          </div>
        )}
      </td>
    </tr>
  )
}

// ─────────────────────────────────────────────────────────
//  전체 합계 행
// ─────────────────────────────────────────────────────────
function GrandTotalRow({ styles, totalK, totalL, totalM, totalN, totalStock, totalOld, totalNew }: {
  styles: StyleRow[]
  totalK: number; totalL: number; totalM: number; totalN: number; totalStock: number
  totalOld: number; totalNew: number
}) {
  const hasOld = totalOld > 0, hasNew = totalNew > 0
  const delta  = hasOld && totalOld > 0 ? ((totalNew - totalOld) / totalOld * 100) : null
  const soreal = totalL > 0 ? totalM / totalL * 100 : null
  const qPct   = totalStock > 0 ? totalN / totalStock * 100 : null

  return (
    <tr className="border-t-4 border-slate-400 text-sm font-bold" style={{ background: '#e2e8f0' }}>
      <td colSpan={2} className="px-3 py-2 text-slate-700">
        전체 합계 ({styles.length}개 스타일)
      </td>
      <td className="border-l-2 border-slate-300" />
      <td className="px-2 py-2 text-right tabular-nums text-slate-800">{totalK.toLocaleString()}</td>
      <td className="px-2 py-2 text-right tabular-nums text-slate-800">{totalL.toLocaleString()}</td>
      <td className="px-2 py-2 text-right tabular-nums text-slate-700">
        {soreal != null ? soreal.toFixed(1) + '%' : '—'}
      </td>
      <td />
      <td className="px-2 py-2 text-right tabular-nums text-slate-800">{totalN.toLocaleString()}</td>
      <td className="px-2 py-2 text-right tabular-nums text-slate-700">
        {qPct != null ? qPct.toFixed(1) + '%' : '—'}
      </td>
      <td />
      <td className="px-2 py-2 text-right tabular-nums text-slate-800">{totalStock.toLocaleString()}</td>
      <td className="border-l-2 border-slate-300" />
      <td className="border-l-2 border-slate-300" /><td /><td />
      <td className="px-2 py-2 text-right tabular-nums border-l-2 border-slate-300 bg-slate-300 text-slate-800">
        {hasOld ? totalOld.toLocaleString() : '—'}
      </td>
      <td className="px-2 py-2 border-l-2 border-slate-300 bg-blue-200">
        <div className="text-right tabular-nums text-blue-900">{hasNew ? totalNew.toLocaleString() : '—'}</div>
        {delta != null && (
          <div className={cn('text-xs tabular-nums text-right leading-tight',
            delta > 5 ? 'text-orange-600' : delta < -5 ? 'text-blue-600' : 'text-slate-500'
          )}>
            {delta >= 0 ? '▲' : '▼'}{Math.abs(delta).toFixed(1)}% vs 기존
          </div>
        )}
      </td>
    </tr>
  )
}

// ─────────────────────────────────────────────────────────
//  헬퍼 컴포넌트
// ─────────────────────────────────────────────────────────
function FilterSelect({ label, value, onChange, children }: {
  label: string
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="text-xs border border-slate-200 rounded px-2 py-1 bg-white text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-400"
      aria-label={label}
    >
      {children}
    </select>
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
    <span className={cn('text-xs px-1.5 py-0 rounded border font-semibold leading-5 mt-0.5 inline-block', map[plc] ?? '')}>
      {plc}
    </span>
  )
}

function Tip({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex items-center ml-0.5 align-middle">
      <span className="text-[9px] text-slate-400 group-hover:text-slate-200 cursor-help leading-none select-none">ℹ</span>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-48 bg-slate-900 text-slate-100 text-xs rounded px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-normal text-center leading-relaxed shadow-xl border border-slate-700">
        {text}
      </span>
    </span>
  )
}

// Re-export for backward compat
export { PlcBadge }
