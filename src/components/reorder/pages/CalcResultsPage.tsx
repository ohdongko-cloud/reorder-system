'use client'

import { useCallback, useState, useMemo } from 'react'
import { useReorderStore } from '@/store/reorder-store'
import { InlineNumberInput } from '../InlineNumberInput'
import { StrategySelector } from '../StrategySelector'
import { TModal } from '../TModal'
import { STRATEGY_LABELS, STRATEGY_COLORS, MIN_RECOMMEND_QTY } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { CheckCircle, X, Copy } from 'lucide-react'
import type { ColorRow, StyleRow, PlcStage, Strategy } from '@/types/reorder'

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

export function CalcResultsPage() {
  const styles         = useReorderStore(s => s.styles)
  const updateColorField = useReorderStore(s => s.updateColorField)
  const setAllStrategies = useReorderStore(s => s.setAllStrategies)
  const currentSession = useReorderStore(s => s.currentSession)

  const [plcFilter, setPlcFilter]   = useState<PlcStage | 'all'>('all')
  const [qtyFilter, setQtyFilter]   = useState<'300+' | 'all'>('300+')
  const [tModal, setTModal]         = useState<TModalState>({ open: false, color: null, style: null })
  const [confirmModal, setConfirmModal] = useState(false)

  const filteredStyles = useMemo(() => {
    return styles.filter(style => {
      if (plcFilter !== 'all' && style.plc !== plcFilter) return false
      if (qtyFilter === '300+') return style.colors.some(c => (c.calcNew ?? 0) >= MIN_RECOMMEND_QTY)
      return true
    })
  }, [styles, plcFilter, qtyFilter])

  let totalOld = 0, totalNew = 0, totalAj = 0, totalColors = 0
  for (const style of filteredStyles) {
    for (const c of style.colors) {
      totalOld   += c.calcOld ?? 0
      totalNew   += c.calcNew ?? 0
      totalAj    += c.aj
      totalColors++
    }
  }

  // 글로벌 발주 성향 현황 (모든 스타일이 같으면 해당 값, 다르면 null)
  const globalStrategy: Strategy | null = useMemo(() => {
    if (styles.length === 0) return 3
    const first = styles[0].strategy
    return styles.every(s => s.strategy === first) ? first : null
  }, [styles])

  const update = useCallback(
    (styleId: string, colorId: string, field: 'n' | 's' | 't' | 'r' | 'aj', value: number) => {
      updateColorField(styleId, colorId, field, value)
    },
    [updateColorField]
  )

  function openTModal(color: ColorRow, style: StyleRow) {
    setTModal({ open: true, color, style })
  }

  function handleExcelCopy() {
    const rows: string[][] = [
      ['스타일', '컬러', 'PLC', '주판량', '주판율%', '현재재고', '기존추천', '신규제안', '확정발주'],
    ]
    for (const style of filteredStyles) {
      for (const color of style.colors) {
        const stock = color.l - color.m
        const qPct  = stock > 0 ? ((color.n / stock) * 100).toFixed(1) : ''
        rows.push([
          style.code, color.color_name, style.plc,
          String(color.n), qPct, String(stock),
          String(color.calcOld ?? ''), String(color.calcNew ?? ''), String(color.aj),
        ])
      }
    }
    navigator.clipboard.writeText(rows.map(r => r.join('\t')).join('\n'))
      .then(() => toast.success('클립보드에 복사됐습니다'))
      .catch(() => toast.error('복사 실패'))
  }

  if (styles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 text-slate-400 py-24">
        <div className="text-4xl mb-3">📊</div>
        <div className="text-sm">300장 이상 추천되는 스타일이 없습니다.</div>
        <div className="text-xs mt-1 text-slate-300">엑셀 파일을 업로드하면 자동으로 계산됩니다.</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">

      {/* ── 헤더 바 ── */}
      <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between shrink-0">
        <div>
          <div className="text-sm font-bold text-slate-800">계산 결과</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {filteredStyles.length}개 스타일 · {totalColors}개 컬러 · 컬러 1개 이상 {MIN_RECOMMEND_QTY}장 이상인 스타일의 모든 컬러 표시
            {currentSession && <span className="ml-2 text-slate-400">· {currentSession.name}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-2.5 text-[10px] text-slate-500 mr-1">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#94a3b8' }} />기존 추천
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block bg-blue-500" />신규 추천
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block bg-amber-500" />MD 확정
            </span>
          </div>
          <button
            onClick={handleExcelCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Copy className="w-3 h-3" />엑셀 복사
          </button>
          <button
            onClick={() => setConfirmModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700 transition-colors"
          >
            <CheckCircle className="w-3.5 h-3.5" />발주 확정
          </button>
        </div>
      </div>

      {/* ── 글로벌 발주 성향 바 + 필터 ── */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center gap-3 shrink-0 flex-wrap">
        <span className="text-[10px] text-slate-500 font-semibold shrink-0">스타일별 발주 성향</span>
        <div className="flex items-center gap-1">
          {STRATEGY_LEVELS.map(lv => {
            const isActive = globalStrategy === lv
            const color = STRATEGY_COLORS[lv]
            return (
              <button
                key={lv}
                onClick={() => setAllStrategies(lv)}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-semibold border transition-all"
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
        <span className="text-[10px] text-slate-400 hidden xl:block">업로드 전체 계산 후 자동 선별된 스타일</span>

        {/* 필터 — 우측 */}
        <div className="ml-auto flex items-center gap-2">
          <select
            value={plcFilter}
            onChange={e => setPlcFilter(e.target.value as PlcStage | 'all')}
            className="text-[10px] border border-slate-200 rounded px-2 py-1 bg-white text-slate-600 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="all">PLC 전체</option>
            <option value="도입기">도입기</option>
            <option value="성장기">성장기</option>
            <option value="유지기">유지기</option>
            <option value="쇠퇴기">쇠퇴기</option>
          </select>
          <select
            value={qtyFilter}
            onChange={e => setQtyFilter(e.target.value as '300+' | 'all')}
            className="text-[10px] border border-slate-200 rounded px-2 py-1 bg-white text-slate-600 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="300+">≥{MIN_RECOMMEND_QTY}장 (추천 대상)</option>
            <option value="all">전체 보기</option>
          </select>
        </div>
      </div>

      {/* ── 테이블 ── */}
      {filteredStyles.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-slate-400 py-16">
          <div className="text-3xl mb-2">🔍</div>
          <div className="text-sm">조건에 맞는 스타일이 없습니다.</div>
          <button
            onClick={() => { setPlcFilter('all'); setQtyFilter('all') }}
            className="mt-2 text-xs text-blue-500 underline"
          >필터 초기화</button>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full min-w-[960px] border-collapse text-xs bg-white">
            <colgroup>
              <col style={{ width: 200 }} />{/* 스타일 */}
              <col style={{ width: 90 }} /> {/* 컬러 */}
              <col style={{ width: 60 }} /> {/* PLC */}
              <col style={{ width: 72 }} /> {/* 주판량 */}
              <col style={{ width: 66 }} /> {/* 주판율 */}
              <col style={{ width: 68 }} /> {/* 현재재고 */}
              <col style={{ width: 88 }} /> {/* 전년/T */}
              <col style={{ width: 90 }} /> {/* 기존추천 */}
              <col style={{ width: 108 }} />{/* 신규제안 */}
              <col style={{ width: 96 }} /> {/* 확정발주 */}
              <col style={{ width: 52 }} /> {/* 위험 */}
            </colgroup>

            <thead className="sticky top-0 z-20">
              {/* 그룹 헤더 */}
              <tr className="text-white text-[10px]">
                <th rowSpan={3} className="px-3 py-2 text-left text-[11px] align-bottom bg-slate-800 border-r border-slate-600">
                  스타일<InfoTooltip text="스타일코드·상품명·가격·경과일·취급 매장 수입니다." />
                </th>
                <th rowSpan={3} className="px-2 py-2 text-left text-[11px] align-bottom bg-slate-800">컬러</th>
                <th rowSpan={3} className="px-2 py-2 text-center text-[11px] align-bottom bg-slate-800">
                  PLC<InfoTooltip text="상품 생애주기 단계(도입기·성장기·유지기·쇠퇴기). 최초입고일 기준으로 자동 산정됩니다." />
                </th>
                <th colSpan={3} className="px-2 pt-2 pb-1 text-center font-semibold bg-slate-600 border-l-2 border-slate-500">판매 현황</th>
                <th colSpan={1} className="px-2 pt-2 pb-1 text-center font-semibold bg-slate-500 border-l-2 border-slate-400">발주 설정</th>
                <th colSpan={1} className="px-2 pt-2 pb-1 text-center font-semibold border-l-2 border-slate-600" style={{ background: '#334155' }}>기존 로직</th>
                <th colSpan={1} className="px-2 pt-2 pb-1 text-center font-semibold border-l-2 border-slate-700" style={{ background: '#1e3a5f' }}>신규 로직 (PLC 보정)</th>
                <th colSpan={2} className="px-2 pt-2 pb-1 text-center font-semibold border-l-2 border-yellow-900" style={{ background: '#5b4406' }}>MD 확정</th>
              </tr>

              {/* 컬럼 헤더 */}
              <tr className="text-slate-200 text-[9px]">
                <th className="px-1 pb-1 text-center bg-slate-600 border-l-2 border-slate-500 whitespace-nowrap">
                  주판량<InfoTooltip text="4주 평균 주간 판매량(pcs). BI_요일판매 28일 합산 ÷ 4로 자동 산출됩니다. 직접 수정 가능합니다." />
                </th>
                <th className="px-1 pb-1 text-center bg-slate-600 whitespace-nowrap">
                  주판율<InfoTooltip text="주판량 ÷ 현재재고 × 100(%). 10% 이상이면 판매 속도가 빠른 상품입니다." />
                </th>
                <th className="px-1 pb-1 text-center bg-slate-600 whitespace-nowrap">
                  현재재고<InfoTooltip text="현재 판매 가능한 재고 수량(pcs). 입고량 - 누적판매량으로 산출됩니다." />
                </th>
                <th className="px-1 pb-1 text-center bg-slate-500 border-l-2 border-slate-400 whitespace-nowrap">
                  전년/T<InfoTooltip text="전년 유사상품 PLC 패턴을 참고해 파라미터를 조정합니다. 클릭하면 유사 상품 선택 화면이 열립니다." />
                </th>
                <th className="px-1 pb-1 text-center border-l-2 border-slate-600 whitespace-nowrap" style={{ background: '#334155' }}>
                  추천발주<InfoTooltip text="W=0.3 고정 가중치 기존 로직의 추천 수량(pcs)입니다. 신규 로직과 비교 기준으로 사용됩니다." />
                </th>
                <th className="px-1 pb-1 text-center border-l-2 border-slate-700 whitespace-nowrap" style={{ background: '#1e3a5f' }}>
                  제안수량<InfoTooltip text="PLC 보정 신규 로직의 추천 수량(pcs). 아래 % = 기존 추천 대비 증감률입니다." />
                </th>
                <th className="px-1 pb-1 text-center border-l-2 border-yellow-900 whitespace-nowrap" style={{ background: '#5b4406' }}>
                  확정발주<InfoTooltip text="MD가 최종 입력하는 확정 발주 수량(pcs). 미입력 시 발주 확정에서 제외됩니다." />
                </th>
                <th className="px-1 pb-1 text-center border-l border-yellow-900 whitespace-nowrap" style={{ background: '#5b4406' }}>
                  위험<InfoTooltip text="확정발주 ÷ 제안수량 비율. ●빨강=부족(0.6미만), ●초록=적정, ●주황=과잉(1.5초과)" />
                </th>
              </tr>
              <tr>
                <td colSpan={11} className="p-0 h-0.5 bg-slate-900" />
              </tr>
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
            </tbody>
          </table>
        </div>
      )}

      {/* ── 하단 서머리 바 ── */}
      <div className="bg-slate-900 text-white px-4 py-2.5 flex items-center gap-6 text-xs shrink-0">
        <span className="text-slate-400 font-medium shrink-0">스타일 수: {filteredStyles.length}개</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#94a3b8' }} />
          <span className="text-slate-400">기존 로직 합계:</span>
          <span className="font-bold tabular-nums">{totalOld.toLocaleString()} pcs</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
          <span className="text-slate-400">신규 로직 합계:</span>
          <span className="font-bold text-blue-400 tabular-nums">{totalNew.toLocaleString()} pcs</span>
          {totalOld > 0 && (
            <span className={cn('text-[10px] tabular-nums', totalNew > totalOld ? 'text-red-400' : 'text-blue-400')}>
              ({totalNew > totalOld ? '▲' : '▼'}{Math.abs((totalNew - totalOld) / totalOld * 100).toFixed(1)}%)
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
          <span className="text-slate-400">MD 확정 합계:</span>
          <span className="font-bold text-amber-400 tabular-nums">{totalAj.toLocaleString()} pcs</span>
        </div>
        <button className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs transition-colors shrink-0">
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
          <div className="bg-white rounded-xl shadow-xl w-80 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800">발주 확정</h3>
              <button onClick={() => setConfirmModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <p className="text-xs text-slate-600 mb-4">아래 수량으로 발주를 확정합니다.</p>
            <div className="bg-slate-50 rounded-lg p-3 mb-4 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">스타일 수</span>
                <span className="font-semibold">{filteredStyles.length}개</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">확정 발주량</span>
                <span className="font-bold text-amber-700">{totalAj.toLocaleString()} pcs</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">신규 제안 대비</span>
                <span className={totalNew > 0 && totalAj < totalNew * 0.6 ? 'text-red-600 font-semibold' : 'text-slate-700'}>
                  {totalNew > 0 ? (totalAj / totalNew * 100).toFixed(0) + '%' : '—'}
                </span>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmModal(false)} className="px-4 py-1.5 rounded border border-slate-300 text-xs text-slate-600 hover:bg-slate-50">취소</button>
              <button
                onClick={() => {
                  setConfirmModal(false)
                  toast.success('발주가 확정되었습니다.', { description: `총 ${totalAj.toLocaleString()} pcs · ${filteredStyles.length}개 스타일` })
                }}
                className="px-4 py-1.5 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
              >확정</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
//  StyleRows
// ─────────────────────────────────────────────────────────
function StyleRows({
  style,
  onTModal,
  onUpdateColor,
}: {
  style: StyleRow
  onTModal: (c: ColorRow, s: StyleRow) => void
  onUpdateColor: (styleId: string, colorId: string, field: 'n' | 's' | 't' | 'r' | 'aj', value: number) => void
}) {
  const colorCount = style.colors.length

  return (
    <>
      {style.colors.map((color, ci) => {
        const inactive = color.l === 0
        const { calcOld, calcNew, delta } = color

        const stock  = color.l - color.m
        const qPct   = stock > 0 ? (color.n / stock) * 100 : null

        const qColor =
          qPct == null ? 'text-slate-400' :
          qPct >= 10   ? 'text-red-600 font-semibold' :
          qPct >= 7    ? 'text-amber-600 font-semibold' :
          'text-slate-500'

        const deltaColor =
          delta == null ? '' :
          delta > 5     ? 'text-red-500' :
          delta < -5    ? 'text-blue-400' :
          'text-slate-400'

        const riskDot = (() => {
          if (!calcNew || calcNew === 0) return null
          if (color.aj === 0) return { color: '#94a3b8', symbol: '○' }
          const r = color.aj / calcNew
          if (r < 0.6)  return { color: '#dc2626', symbol: '●', label: '▲부족' }
          if (r > 1.5)  return { color: '#d97706', symbol: '●', label: '▼과잉' }
          return { color: '#10b981', symbol: '●', label: '✓' }
        })()

        return (
          <tr
            key={color.id}
            className={cn(
              'border-b border-slate-100 hover:bg-slate-50/60 transition-colors',
              inactive && 'opacity-40'
            )}
          >
            {/* ── 스타일 셀 ── */}
            {ci === 0 && (
              <td className="px-2 py-2 align-top border-r border-slate-200 bg-white" rowSpan={colorCount}>
                <div className="flex gap-2">
                  {/* 이미지 placeholder */}
                  <div className="w-12 h-[52px] shrink-0 border-2 border-dashed border-slate-200 rounded flex items-center justify-center text-[9px] text-slate-300 font-bold bg-slate-50 select-none">
                    IMG
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="font-mono text-[11px] font-bold text-slate-800">{style.code}</span>
                      <StyleTypeBadge type={style.type} />
                    </div>
                    {/* 상품명 자리 (비어있음 — 추후 파싱 추가) */}
                    <div className="h-[14px]" />
                    <div className="text-[10px] text-slate-400 leading-tight">
                      ₩{style.price.toLocaleString()} · {style.days_since_inbound}일 · {style.stores}매장
                    </div>
                    <div className="mt-1.5 pt-1 border-t border-slate-100 flex items-center gap-1 flex-wrap">
                      <StrategySelector styleId={style.id} strategy={style.strategy} />
                    </div>
                    <button
                      onClick={() => onTModal(style.colors[0], style)}
                      className="text-[10px] text-blue-600 underline hover:text-blue-800 mt-0.5"
                    >전년 유사상품 선택</button>
                  </div>
                </div>
              </td>
            )}

            {/* 컬러 */}
            <td className="px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                {color.color_hex && (
                  <span className="w-2.5 h-2.5 rounded-full border border-black/10 shrink-0" style={{ background: color.color_hex }} />
                )}
                <span className="text-xs text-slate-700 truncate">{color.color_name}</span>
              </div>
            </td>

            {/* PLC */}
            {ci === 0 && (
              <td className="px-2 py-1 text-center" rowSpan={colorCount}>
                <PlcBadge plc={style.plc} />
              </td>
            )}

            {/* 주판량(N) */}
            <td className="px-1.5 py-1 border-l-2 border-slate-200">
              <InlineNumberInput value={color.n} onChange={v => onUpdateColor(style.id, color.id, 'n', v)} min={0} disabled={inactive} />
            </td>

            {/* 주판율 */}
            <td className={cn('px-2 py-1 text-right tabular-nums text-[11px]', qColor)}>
              {qPct != null ? qPct.toFixed(1) + '%' : '—'}
            </td>

            {/* 현재재고 */}
            <td className="px-2 py-1 text-right tabular-nums text-[11px] text-slate-600">
              {inactive ? '—' : stock.toLocaleString()}
            </td>

            {/* 전년/T 버튼 */}
            <td className="px-1.5 py-1 border-l-2 border-slate-200">
              <button
                onClick={() => onTModal(color, style)}
                disabled={inactive}
                className="w-full px-2 py-1 rounded text-[10px] font-semibold text-white transition-colors disabled:opacity-40 disabled:pointer-events-none"
                style={{ background: '#334155' }}
              >
                전년상품 선택
              </button>
            </td>

            {/* 기존 추천 */}
            <td className={cn(
              'px-2 py-1 text-right tabular-nums font-semibold text-[11px] border-l-2 border-slate-200',
              inactive ? 'text-slate-300' : 'bg-slate-50 text-slate-500'
            )}>
              {inactive ? '—' : fmt(calcOld)}
            </td>

            {/* 신규 제안 + delta 인라인 */}
            <td className={cn('px-2 py-1 border-l-2 border-slate-200', !inactive && 'bg-blue-50')}>
              <div className={cn('text-right tabular-nums font-bold text-[11px]',
                inactive ? 'text-slate-300' : 'text-blue-700'
              )}>
                {inactive ? '—' : fmt(calcNew)}
              </div>
              {!inactive && delta != null && (
                <div className={cn('text-[9px] tabular-nums text-right leading-tight', deltaColor)}>
                  {delta >= 0 ? '▲' : '▼'}{Math.abs(delta).toFixed(1)}% vs 기존
                </div>
              )}
            </td>

            {/* 확정발주 */}
            <td className="px-1.5 py-1 border-l-2 border-slate-200">
              <InlineNumberInput
                value={color.aj}
                onChange={v => onUpdateColor(style.id, color.id, 'aj', v)}
                min={0}
                className="w-16 bg-amber-50 border-amber-300"
                disabled={inactive}
              />
            </td>

            {/* 위험 도트 */}
            <td className="px-2 py-1 text-center border-l border-slate-200">
              {riskDot ? (
                <span className="text-sm leading-none" style={{ color: riskDot.color }}>
                  {riskDot.symbol}
                </span>
              ) : (
                <span className="text-slate-200">○</span>
              )}
            </td>
          </tr>
        )
      })}
      <StyleSubtotalRow style={style} />
    </>
  )
}

// ─────────────────────────────────────────────────────────
//  소계 행
// ─────────────────────────────────────────────────────────
function StyleSubtotalRow({ style }: { style: StyleRow }) {
  let sumOld = 0, sumNew = 0, sumAj = 0
  let hasOld = false, hasNew = false
  for (const c of style.colors) {
    if (c.calcOld != null) { sumOld += c.calcOld; hasOld = true }
    if (c.calcNew != null) { sumNew += c.calcNew; hasNew = true }
    sumAj += c.aj
  }
  const delta = hasOld && sumOld > 0 ? ((sumNew - sumOld) / sumOld) * 100 : null

  return (
    <tr className="border-t-2 border-b-2 border-slate-300 text-xs font-semibold" style={{ background: '#f8fafc' }}>
      <td colSpan={3} className="px-3 py-1 text-slate-500 text-[10px]">{style.colors.length}컬러 합계</td>
      <td colSpan={3} className="border-l-2 border-slate-200" />
      <td className="border-l-2 border-slate-200" />
      <td className="px-2 py-1 text-right tabular-nums border-l-2 border-slate-200 bg-slate-200 text-slate-600">
        {hasOld ? sumOld.toLocaleString() : '—'}
      </td>
      <td className="px-2 py-1 border-l-2 border-slate-200 bg-blue-100">
        <div className="text-right tabular-nums text-blue-800">{hasNew ? sumNew.toLocaleString() : '—'}</div>
        {delta != null && (
          <div className={cn('text-[9px] tabular-nums text-right leading-tight',
            delta > 5 ? 'text-red-500' : delta < -5 ? 'text-blue-500' : 'text-slate-400'
          )}>
            {delta >= 0 ? '▲' : '▼'}{Math.abs(delta).toFixed(1)}% vs 기존
          </div>
        )}
      </td>
      <td className="px-2 py-1 text-right tabular-nums border-l-2 border-slate-200 text-amber-700">
        {sumAj > 0 ? sumAj.toLocaleString() : '—'}
      </td>
      <td className="border-l border-slate-200" />
    </tr>
  )
}

// ─────────────────────────────────────────────────────────
//  헬퍼 컴포넌트
// ─────────────────────────────────────────────────────────
function StyleTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    normal:  { label: '일반',   cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    reorder: { label: '리오더', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    test_cn: { label: '사입',   cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  }
  const { label, cls } = map[type] ?? map.normal
  return <span className={cn('text-[10px] px-1.5 rounded border font-semibold', cls)}>{label}</span>
}

function PlcBadge({ plc }: { plc: string }) {
  const map: Record<string, string> = {
    '도입기': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    '성장기': 'bg-blue-50 text-blue-700 border-blue-200',
    '유지기': 'bg-orange-50 text-orange-700 border-orange-200',
    '쇠퇴기': 'bg-red-50 text-red-700 border-red-200',
  }
  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-semibold', map[plc] ?? '')}>
      {plc}
    </span>
  )
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex items-center ml-0.5 align-middle">
      <span className="text-[9px] text-slate-400 group-hover:text-slate-200 cursor-help leading-none select-none">ℹ</span>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-52 bg-slate-900 text-slate-100 text-[10px] rounded px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-normal text-center leading-relaxed shadow-xl border border-slate-700">
        {text}
      </span>
    </span>
  )
}
