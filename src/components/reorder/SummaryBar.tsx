'use client'

import { useReorderStore } from '@/store/reorder-store'

export function SummaryBar() {
  const styles = useReorderStore(s => s.styles)
  const getTotals = useReorderStore(s => s.getTotals)
  const { totalOld, totalNew, totalAj } = getTotals()

  const delta = totalOld > 0 ? ((totalNew - totalOld) / totalOld) * 100 : 0
  const deltaSign = delta >= 0 ? '+' : ''
  const styleCount = styles.length
  const activeColors = styles.flatMap(s => s.colors).filter(c => c.l > 0).length

  return (
    <div className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-2 flex gap-6 items-center text-sm shadow-sm">
      <div className="flex flex-col items-center">
        <span className="text-xs text-slate-500">스타일 수</span>
        <span className="font-bold text-slate-800">{styleCount}</span>
      </div>
      <div className="w-px h-8 bg-slate-200" />
      <div className="flex flex-col items-center">
        <span className="text-xs text-slate-500">입고 컬러</span>
        <span className="font-bold text-slate-800">{activeColors}</span>
      </div>
      <div className="w-px h-8 bg-slate-200" />
      <div className="flex flex-col items-center">
        <span className="text-xs text-slate-500">기존 로직 합계 (개)</span>
        <span className="font-bold text-slate-700">{totalOld > 0 ? totalOld.toLocaleString() : '—'}</span>
      </div>
      <div className="w-px h-8 bg-slate-200" />
      <div className="flex flex-col items-center">
        <span className="text-xs text-slate-500">신규 로직 합계 (개)</span>
        <span className="font-bold text-blue-700">{totalNew > 0 ? totalNew.toLocaleString() : '—'}</span>
      </div>
      <div className="w-px h-8 bg-slate-200" />
      <div className="flex flex-col items-center">
        <span className="text-xs text-slate-500">신규 vs 기존</span>
        {totalOld > 0 && totalNew > 0 ? (
          <span className={`font-bold ${delta > 0 ? 'text-red-600' : delta < 0 ? 'text-blue-600' : 'text-slate-500'}`}>
            {deltaSign}{(totalNew - totalOld).toLocaleString()} ({deltaSign}{delta.toFixed(1)}%)
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </div>
      <div className="w-px h-8 bg-slate-200" />
      <div className="flex flex-col items-center">
        <span className="text-xs text-slate-500">확정 발주 합계 (개)</span>
        <span className="font-bold text-emerald-700">{totalAj > 0 ? totalAj.toLocaleString() : '—'}</span>
      </div>
    </div>
  )
}
