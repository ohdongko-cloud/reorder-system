'use client'

import { useCallback } from 'react'
import { useReorderStore } from '@/store/reorder-store'
import { InlineNumberInput } from './InlineNumberInput'
import { cn } from '@/lib/utils'
import type { ColorRow as ColorRowType, StyleRow } from '@/types/reorder'

interface Props {
  color: ColorRowType
  style: StyleRow
  isFirst: boolean
  rowSpan: number
}

function fmt(n: number | null | undefined, fallback = '—') {
  if (n === null || n === undefined) return fallback
  return n.toLocaleString()
}

function fmtPct(n: number | null | undefined) {
  if (n === null || n === undefined) return '—'
  const sign = n >= 0 ? '+' : ''
  return sign + n.toFixed(1) + '%'
}

export function ColorRow({ color, style, isFirst, rowSpan }: Props) {
  const updateColorField = useReorderStore(s => s.updateColorField)

  const update = useCallback(
    (field: 'n' | 's' | 't' | 'r' | 'aj', value: number) => {
      updateColorField(style.id, color.id, field, value)
    },
    [style.id, color.id, updateColorField]
  )

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
    <tr className={cn(
      'border-b border-slate-100 hover:bg-slate-50/50 transition-colors',
      inactive && 'opacity-40'
    )}>
      {/* 스타일 (rowspan) */}
      {isFirst && (
        <td className="px-3 py-1.5 align-top border-r border-slate-200 bg-slate-50/60" rowSpan={rowSpan}>
          <div className="font-mono text-xs font-bold text-slate-800 leading-tight">{style.code}</div>
          <div className="flex flex-wrap gap-1 mt-0.5 items-center">
            <StyleTypeBadge type={style.type} />
            <span className="text-slate-500 text-[10px]">₩{style.price.toLocaleString()}</span>
            <span className="text-slate-400 text-[10px]">· {style.days_since_inbound}일</span>
            <span className="text-slate-400 text-[10px]">· {style.stores}매장</span>
          </div>
        </td>
      )}

      {/* 컬러 */}
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          {color.color_hex && (
            <span
              className="w-2.5 h-2.5 rounded-full border border-black/10 flex-shrink-0"
              style={{ background: color.color_hex }}
            />
          )}
          <span className="text-xs text-slate-700 whitespace-nowrap">{color.color_name}</span>
          {inactive && (
            <span className="text-[10px] bg-slate-100 text-slate-400 px-1 rounded border border-slate-200">미입고</span>
          )}
        </div>
      </td>

      {/* PLC (rowspan) */}
      {isFirst && (
        <td className="px-2 py-1 text-center" rowSpan={rowSpan}>
          <PlcBadge plc={style.plc} />
        </td>
      )}

      {/* 수동 입력: N, S, T */}
      <td className="px-1.5 py-1 border-l-2 border-slate-300">
        <InlineNumberInput value={color.n} onChange={v => update('n', v)} min={0} disabled={inactive} />
      </td>
      <td className="px-1.5 py-1">
        <InlineNumberInput value={color.s} onChange={v => update('s', v)} min={1} max={52} disabled={inactive} />
      </td>
      <td className="px-1.5 py-1">
        <InlineNumberInput value={color.t} onChange={v => update('t', v)} min={0.1} max={10} step={0.1} disabled={inactive} />
      </td>

      {/* 기존 로직 */}
      <td className="px-2 py-1 text-right text-xs border-l-2 border-slate-300 tabular-nums">
        {inactive ? <span className="text-slate-300">—</span> : fmt(calcOld)}
      </td>
      <td className="px-2 py-1 text-right text-[10px] text-slate-500 tabular-nums">
        {qRate !== null && qRate !== undefined ? (qRate * 100).toFixed(1) + '%' : '—'}
      </td>
      <td className="px-2 py-1 text-right text-[10px] text-slate-500 tabular-nums">
        {uOld !== null && uOld !== undefined ? uOld.toFixed(2) + 'x' : '—'}
      </td>

      {/* 신규 로직 */}
      <td className="px-2 py-1 text-right text-xs font-semibold text-blue-700 border-l-2 border-slate-300 tabular-nums">
        {inactive ? <span className="text-slate-300">—</span> : fmt(calcNew)}
      </td>
      <td className={cn('px-2 py-1 text-right text-[10px] tabular-nums', deltaClass)}>
        {hasCalc && !inactive ? fmtPct(delta) : '—'}
      </td>
      <td className="px-2 py-1 text-right text-[10px] text-slate-500 tabular-nums">
        {uNew !== null && uNew !== undefined ? uNew.toFixed(2) + 'x' : '—'}
      </td>

      {/* 확정발주 AJ */}
      <td className="px-1.5 py-1 border-l-2 border-slate-300">
        <InlineNumberInput
          value={color.aj}
          onChange={v => update('aj', v)}
          min={0}
          className="w-16 bg-emerald-50 border-emerald-300"
          disabled={inactive}
        />
      </td>

      {/* 위험 판정 */}
      <td className="px-2 py-1 text-center text-[10px] border-l border-slate-200">
        {riskLabel ? (
          <span className={riskLabel.cls}>{riskLabel.text}</span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
    </tr>
  )
}

function StyleTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    normal:   { label: '일반', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    reorder:  { label: '리오더', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    test_cn:  { label: '사입', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  }
  const { label, cls } = map[type] ?? map.normal
  return (
    <span className={cn('text-[10px] px-1.5 py-0 rounded border font-semibold', cls)}>{label}</span>
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
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-semibold', map[plc] ?? '')}>
      {plc}
    </span>
  )
}
