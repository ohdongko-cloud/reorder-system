'use client'

import { useReorderStore } from '@/store/reorder-store'
import { ColorRow } from './ColorRow'
import { StyleSubtotal } from './StyleSubtotal'

export function ReorderTable() {
  const styles = useReorderStore(s => s.styles)

  if (styles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <div className="text-4xl mb-3">📂</div>
        <div className="text-sm">엑셀 파일을 업로드하거나 세션을 선택하세요</div>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] border-collapse text-xs bg-white">
        <thead className="sticky top-[41px] z-20">
          <tr className="bg-slate-800 text-slate-100">
            <th rowSpan={2} className="px-3 py-2 text-left text-[11px] font-semibold min-w-[148px] border-r border-slate-600">스타일</th>
            <th rowSpan={2} className="px-2 py-2 text-left text-[11px] font-semibold min-w-[88px]">컬러</th>
            <th rowSpan={2} className="px-2 py-2 text-center text-[11px] font-semibold w-14">PLC</th>
            <th colSpan={3} className="px-2 py-1 text-center text-[11px] font-semibold border-l-2 border-slate-500">수동 입력</th>
            <th colSpan={3} className="px-2 py-1 text-center text-[11px] font-semibold border-l-2 border-slate-500">기존 로직 (W=0.3)</th>
            <th colSpan={3} className="px-2 py-1 text-center text-[11px] font-semibold border-l-2 border-slate-500">신규 로직 (PLC보정 · 동적W)</th>
            <th rowSpan={2} className="px-2 py-2 text-center text-[11px] font-semibold w-16 border-l-2 border-slate-500">확정발주<br />(AJ,개)</th>
            <th rowSpan={2} className="px-2 py-2 text-center text-[11px] font-semibold w-11 border-l border-slate-600">위험</th>
          </tr>
          <tr className="bg-slate-700 text-slate-200 border-b-2 border-slate-900">
            <th className="px-1 py-1 text-center text-[10px] w-14 border-l-2 border-slate-500">주판량<br />(N,개/주)</th>
            <th className="px-1 py-1 text-center text-[10px] w-11">판매기간<br />(S,주)</th>
            <th className="px-1 py-1 text-center text-[10px] w-12">T값<br />(배수)</th>
            <th className="px-1 py-1 text-center text-[10px] w-16 border-l-2 border-slate-500">추천수량<br />(AD,개)</th>
            <th className="px-1 py-1 text-center text-[10px] w-12">주판율<br />(Q,%)</th>
            <th className="px-1 py-1 text-center text-[10px] w-12">U값</th>
            <th className="px-1 py-1 text-center text-[10px] w-16 border-l-2 border-slate-500">추천수량<br />(AD,개)</th>
            <th className="px-1 py-1 text-center text-[10px] w-12">vs기존<br />(%)</th>
            <th className="px-1 py-1 text-center text-[10px] w-12">U값</th>
          </tr>
        </thead>
        <tbody>
          {styles.map((style) => (
            <>
              {style.colors.map((color, ci) => (
                <ColorRow
                  key={color.id}
                  color={color}
                  style={style}
                  isFirst={ci === 0}
                  rowSpan={style.colors.length}
                />
              ))}
              <StyleSubtotal key={`sub_${style.id}`} style={style} />
            </>
          ))}
        </tbody>
      </table>
    </div>
  )
}
