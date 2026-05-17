'use client'

import type { StyleRow } from '@/types/reorder'
import { cn } from '@/lib/utils'

interface Props {
  style: StyleRow
}

export function StyleSubtotal({ style }: Props) {
  let sumOld = 0, sumNew = 0, sumAj = 0
  let hasOld = false, hasNew = false

  for (const c of style.colors) {
    if (c.calcOld !== null && c.calcOld !== undefined) { sumOld += c.calcOld; hasOld = true }
    if (c.calcNew !== null && c.calcNew !== undefined) { sumNew += c.calcNew; hasNew = true }
    sumAj += c.aj
  }

  const delta = hasOld && sumOld > 0 ? ((sumNew - sumOld) / sumOld) * 100 : null
  const deltaSign = delta !== null && delta >= 0 ? '+' : ''

  return (
    <tr className="bg-slate-100 border-t-2 border-b-2 border-slate-300 text-xs font-semibold">
      <td colSpan={3} className="px-3 py-1 text-slate-500">
        ▶ {style.code} 소계
      </td>
      {/* 입력 열 3개 */}
      <td colSpan={3} className="border-l-2 border-slate-300" />
      {/* 기존 소계 */}
      <td className="px-2 py-1 text-right tabular-nums border-l-2 border-slate-300 text-slate-700">
        {hasOld ? sumOld.toLocaleString() : '—'}
      </td>
      <td /><td />
      {/* 신규 소계 */}
      <td className="px-2 py-1 text-right tabular-nums border-l-2 border-slate-300 text-blue-700">
        {hasNew ? sumNew.toLocaleString() : '—'}
      </td>
      <td className={cn(
        'px-2 py-1 text-right text-[10px] tabular-nums',
        delta !== null && delta > 5 ? 'text-red-600' : delta !== null && delta < -5 ? 'text-blue-600' : 'text-slate-400'
      )}>
        {delta !== null ? `${deltaSign}${delta.toFixed(1)}%` : '—'}
      </td>
      <td />
      {/* AJ 소계 */}
      <td className="px-2 py-1 text-right tabular-nums border-l-2 border-slate-300 text-emerald-700">
        {sumAj > 0 ? sumAj.toLocaleString() : '—'}
      </td>
      <td className="border-l border-slate-200" />
    </tr>
  )
}
