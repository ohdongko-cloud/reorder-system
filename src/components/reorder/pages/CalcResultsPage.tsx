'use client'

import { useCallback } from 'react'
import { useReorderStore } from '@/store/reorder-store'
import { InlineNumberInput } from '../InlineNumberInput'
import { StrategySelector } from '../StrategySelector'
import { TModal } from '../TModal'
import { STRATEGY_LABELS, MIN_RECOMMEND_QTY } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { CheckCircle, X } from 'lucide-react'
import type { ColorRow, StyleRow } from '@/types/reorder'
import { useState } from 'react'

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString()
}
function fmtPct(n: number | null | undefined) {
  if (n == null) return '—'
  return (n >= 0 ? '+' : '') + n.toFixed(1) + '%'
}

interface TModalState {
  open: boolean
  color: ColorRow | null
  style: StyleRow | null
}

export function CalcResultsPage() {
  // Subscribe to styles directly so component re-renders when strategy changes
  const styles = useReorderStore(s => s.styles)
  const updateColorField = useReorderStore(s => s.updateColorField)
  const currentSession = useReorderStore(s => s.currentSession)

  const [tModal, setTModal] = useState<TModalState>({ open: false, color: null, style: null })
  const [confirmModal, setConfirmModal] = useState(false)

  const filteredStyles = styles.filter(style =>
    style.colors.some(c => (c.calcNew ?? 0) >= MIN_RECOMMEND_QTY)
  )

  let totalOld = 0, totalNew = 0, totalAj = 0
  for (const style of filteredStyles) {
    for (const c of style.colors) {
      totalOld += c.calcOld ?? 0
      totalNew += c.calcNew ?? 0
      totalAj  += c.aj
    }
  }

  const update = useCallback(
    (styleId: string, colorId: string, field: 'n' | 's' | 't' | 'r' | 'aj', value: number) => {
      updateColorField(styleId, colorId, field, value)
    },
    [updateColorField]
  )

  function openTModal(color: ColorRow, style: StyleRow) {
    setTModal({ open: true, color, style })
  }

  if (filteredStyles.length === 0) {
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
      {/* Sub-header */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between">
        <div className="text-xs text-slate-500">
          <span className="font-semibold text-slate-700">{filteredStyles.length}개 스타일</span>
          <span className="ml-1.5">신규 추천 {MIN_RECOMMEND_QTY}장 이상 조건</span>
          {currentSession && (
            <span className="ml-2 text-slate-400">· {currentSession.name}</span>
          )}
        </div>
        <button
          onClick={() => setConfirmModal(true)}
          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700 flex items-center gap-1.5"
        >
          <CheckCircle className="w-3.5 h-3.5" />
          발주 확정
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[1020px] border-collapse text-xs bg-white">
          <colgroup>
            <col style={{ width: 172 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 64 }} />
            <col style={{ width: 64 }} />
            <col style={{ width: 62 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 84 }} />
            <col style={{ width: 72 }} />
            <col style={{ width: 72 }} />
            <col style={{ width: 104 }} />
            <col style={{ width: 72 }} />
            <col style={{ width: 72 }} />
            <col style={{ width: 88 }} />
            <col style={{ width: 48 }} />
          </colgroup>
          <thead className="sticky top-0 z-20">
            <tr className="bg-slate-800 text-slate-100 text-[10px]">
              <th rowSpan={3} className="px-3 py-2 text-left text-[11px] border-r border-slate-600 align-bottom">스타일</th>
              <th rowSpan={3} className="px-2 py-2 text-left text-[11px] align-bottom">컬러</th>
              <th rowSpan={3} className="px-2 py-2 text-center text-[11px] align-bottom">PLC</th>
              <th colSpan={3} className="px-2 pt-2 pb-1 text-center text-[10px] font-semibold border-l-2 border-slate-500">수동 입력</th>
              <th colSpan={3} className="px-2 pt-2 pb-1 text-center text-[10px] font-semibold border-l-2 border-slate-500">기존 로직 (W=0.3)</th>
              <th colSpan={3} className="px-2 pt-2 pb-1 text-center text-[10px] font-semibold border-l-2 border-slate-500">신규 로직 (PLC보정·동적W)</th>
              <th rowSpan={3} className="px-2 py-2 text-center text-[11px] align-bottom border-l-2 border-slate-500">MD확정<br />(AJ)</th>
              <th rowSpan={3} className="px-2 py-2 text-center text-[11px] align-bottom border-l border-slate-600">위험</th>
            </tr>
            <tr className="bg-slate-800 text-slate-200 text-[9px]">
              <th className="px-1 pb-1 text-center border-l-2 border-slate-500">N (개/주)</th>
              <th className="px-1 pb-1 text-center">S (주)</th>
              <th className="px-1 pb-1 text-center">T값</th>
              <th className="px-1 pb-1 text-center border-l-2 border-slate-500">추천 (개)</th>
              <th className="px-1 pb-1 text-center">주판율</th>
              <th className="px-1 pb-1 text-center">U값</th>
              <th className="px-1 pb-1 text-center border-l-2 border-slate-500">추천 (개)</th>
              <th className="px-1 pb-1 text-center">vs기존</th>
              <th className="px-1 pb-1 text-center">U값</th>
            </tr>
            <tr className="bg-slate-700 border-b-2 border-slate-900">
              <td colSpan={14} className="p-0 h-0" />
            </tr>
          </thead>
          <tbody>
            {filteredStyles.map((style) => (
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

      {/* Bottom summary bar */}
      <div className="bg-slate-900 text-white px-6 py-2.5 flex items-center gap-8 text-xs shrink-0">
        <span className="font-semibold text-slate-300">합계</span>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">기존 로직</span>
          <span className="font-bold tabular-nums">{totalOld.toLocaleString()}</span>
          <span className="text-slate-500">장</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">신규 로직</span>
          <span className="font-bold text-blue-400 tabular-nums">{totalNew.toLocaleString()}</span>
          <span className="text-slate-500">장</span>
          {totalOld > 0 && (
            <span className={cn(
              'text-[10px] tabular-nums',
              totalNew > totalOld ? 'text-red-400' : 'text-blue-400'
            )}>
              ({fmtPct((totalNew - totalOld) / totalOld * 100)})
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">확정발주</span>
          <span className="font-bold text-emerald-400 tabular-nums">{totalAj.toLocaleString()}</span>
          <span className="text-slate-500">장</span>
        </div>
        <div className="ml-auto text-slate-400 text-[10px]">
          {filteredStyles.length}개 스타일 표시 중
        </div>
      </div>

      {/* T Modal */}
      {tModal.open && tModal.color && tModal.style && (
        <TModal
          open={tModal.open}
          onClose={() => setTModal({ open: false, color: null, style: null })}
          color={tModal.color}
          style={tModal.style}
        />
      )}

      {/* 발주 확정 modal */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl w-80 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800">발주 확정</h3>
              <button onClick={() => setConfirmModal(false)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <p className="text-xs text-slate-600 mb-4">아래 수량으로 발주를 확정합니다.</p>
            <div className="bg-slate-50 rounded-lg p-3 mb-4 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">스타일 수</span>
                <span className="font-semibold">{filteredStyles.length}개</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">확정 발주량</span>
                <span className="font-bold text-emerald-700">{totalAj.toLocaleString()}장</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">신규 추천 대비</span>
                <span className={totalNew > 0 ? (totalAj < totalNew * 0.6 ? 'text-red-600 font-semibold' : 'text-slate-700') : ''}>
                  {totalNew > 0 ? (totalAj / totalNew * 100).toFixed(0) + '%' : '—'}
                </span>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmModal(false)}
                className="px-4 py-1.5 rounded border border-slate-300 text-xs text-slate-600 hover:bg-slate-50"
              >취소</button>
              <button
                onClick={() => {
                  setConfirmModal(false)
                  toast.success('발주가 확정되었습니다.', {
                    description: `총 ${totalAj.toLocaleString()}장 · ${filteredStyles.length}개 스타일`,
                  })
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
        const { calcOld, calcNew, qRate, uOld, uNew, delta } = color
        const hasCalc = calcOld !== null || calcNew !== null

        const deltaClass = delta == null ? '' :
          delta > 5 ? 'text-red-600 font-semibold' :
          delta < -5 ? 'text-blue-600 font-semibold' :
          'text-slate-400'

        const riskLabel = (() => {
          if (!calcNew || calcNew === 0 || color.aj === 0) return null
          const r = color.aj / calcNew
          if (r < 0.6) return { text: '▲부족', cls: 'text-red-600 font-bold' }
          if (r > 1.5) return { text: '▼과잉', cls: 'text-amber-500 font-semibold' }
          return { text: '✓', cls: 'text-emerald-600' }
        })()

        return (
          <tr
            key={color.id}
            className={cn(
              'border-b border-slate-100 hover:bg-slate-50/50 transition-colors',
              inactive && 'opacity-40'
            )}
          >
            {/* Style cell — shown only for first color, spans all colors */}
            {ci === 0 && (
              <td className="px-3 py-2 align-top border-r border-slate-200 bg-white" rowSpan={colorCount}>
                {/* Code + badge */}
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="font-mono text-[11px] font-bold text-slate-800">{style.code}</span>
                  <StyleTypeBadge type={style.type} />
                </div>
                {/* Stores + days */}
                <div className="text-[10px] text-slate-400 mt-0.5">{style.stores}매장 · {style.days_since_inbound}일</div>
                {/* Price */}
                <div className="text-[10px] font-medium text-slate-600 tabular-nums mt-0.5">₩{style.price.toLocaleString()}</div>
                {/* Strategy — 가격 아래, 스타일 코드와 같은 셀 */}
                <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex items-center gap-1 flex-wrap">
                  <StrategySelector styleId={style.id} strategy={style.strategy} />
                  <span className="text-[9px] text-slate-400 ml-0.5">{STRATEGY_LABELS[style.strategy]}</span>
                </div>
              </td>
            )}

            {/* 컬러 */}
            <td className="px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                {color.color_hex && (
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-black/10 shrink-0"
                    style={{ background: color.color_hex }}
                  />
                )}
                <span className="text-xs text-slate-700">{color.color_name}</span>
              </div>
            </td>

            {/* PLC */}
            {ci === 0 && (
              <td className="px-2 py-1 text-center" rowSpan={colorCount}>
                <PlcBadge plc={style.plc} />
              </td>
            )}

            {/* N */}
            <td className="px-1.5 py-1 border-l-2 border-slate-200">
              <InlineNumberInput value={color.n} onChange={v => onUpdateColor(style.id, color.id, 'n', v)} min={0} disabled={inactive} />
            </td>
            {/* S */}
            <td className="px-1.5 py-1">
              <InlineNumberInput value={color.s} onChange={v => onUpdateColor(style.id, color.id, 's', v)} min={1} max={52} disabled={inactive} />
            </td>
            {/* T */}
            <td className="px-1.5 py-1">
              <button
                onClick={() => onTModal(color, style)}
                disabled={inactive}
                className={cn(
                  'w-14 px-1.5 py-0.5 text-right text-xs border rounded tabular-nums',
                  'bg-amber-50 border-amber-300 hover:bg-amber-100 hover:border-amber-400',
                  'disabled:opacity-40 disabled:pointer-events-none'
                )}
              >
                {color.t.toFixed(1)}
              </button>
            </td>

            {/* 기존 로직 추천 — 배경 강조 */}
            <td className={cn(
              'px-2 py-1 text-right border-l-2 border-slate-200 tabular-nums font-semibold',
              inactive ? 'bg-white text-slate-300' : 'bg-slate-100 text-slate-700'
            )}>
              {inactive ? '—' : fmt(calcOld)}
            </td>
            <td className="px-2 py-1 text-right text-[10px] text-slate-500 tabular-nums">
              {qRate != null ? (qRate * 100).toFixed(1) + '%' : '—'}
            </td>
            <td className="px-2 py-1 text-right text-[10px] text-slate-500 tabular-nums">
              {uOld != null ? uOld.toFixed(2) + 'x' : '—'}
            </td>

            {/* 신규 로직 추천 — 배경 강조 */}
            <td className={cn(
              'px-2 py-1 text-right border-l-2 border-slate-200 tabular-nums font-bold',
              inactive ? 'bg-white text-slate-300' : 'bg-blue-50 text-blue-800'
            )}>
              {inactive ? '—' : fmt(calcNew)}
            </td>
            <td className={cn('px-2 py-1 text-right text-[10px] tabular-nums', deltaClass)}>
              {hasCalc && !inactive ? fmtPct(delta) : '—'}
            </td>
            <td className="px-2 py-1 text-right text-[10px] text-slate-500 tabular-nums">
              {uNew != null ? uNew.toFixed(2) + 'x' : '—'}
            </td>

            {/* AJ */}
            <td className="px-1.5 py-1 border-l-2 border-slate-200">
              <InlineNumberInput
                value={color.aj}
                onChange={v => onUpdateColor(style.id, color.id, 'aj', v)}
                min={0}
                className="w-16 bg-emerald-50 border-emerald-300"
                disabled={inactive}
              />
            </td>

            {/* 위험 */}
            <td className="px-2 py-1 text-center text-[10px] border-l border-slate-200">
              {riskLabel ? (
                <span className={riskLabel.cls}>{riskLabel.text}</span>
              ) : (
                <span className="text-slate-300">—</span>
              )}
            </td>
          </tr>
        )
      })}

      {/* Style subtotal */}
      <StyleSubtotalRow style={style} />
    </>
  )
}

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
    <tr className="bg-slate-100 border-t-2 border-b-2 border-slate-300 text-xs font-semibold">
      <td colSpan={3} className="px-3 py-1 text-slate-500 text-[10px]">▶ {style.code} 소계</td>
      <td colSpan={3} className="border-l-2 border-slate-200" />
      <td className="px-2 py-1 text-right tabular-nums border-l-2 border-slate-200 bg-slate-200 text-slate-700">
        {hasOld ? sumOld.toLocaleString() : '—'}
      </td>
      <td /><td />
      <td className="px-2 py-1 text-right tabular-nums border-l-2 border-slate-200 bg-blue-100 text-blue-800">
        {hasNew ? sumNew.toLocaleString() : '—'}
      </td>
      <td className={cn(
        'px-2 py-1 text-right text-[10px] tabular-nums',
        delta !== null && delta > 5 ? 'text-red-600' : delta !== null && delta < -5 ? 'text-blue-600' : 'text-slate-400'
      )}>
        {delta !== null ? (delta >= 0 ? '+' : '') + delta.toFixed(1) + '%' : '—'}
      </td>
      <td />
      <td className="px-2 py-1 text-right tabular-nums border-l-2 border-slate-200 text-emerald-700">
        {sumAj > 0 ? sumAj.toLocaleString() : '—'}
      </td>
      <td className="border-l border-slate-200" />
    </tr>
  )
}

function StyleTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    normal:  { label: '일반', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    reorder: { label: '리오더', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    test_cn: { label: '사입', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
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
