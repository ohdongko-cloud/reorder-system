'use client'

import { useState } from 'react'
import { useReorderStore } from '@/store/reorder-store'
import { STYLE_BADGE_COLORS, STYLE_BADGE_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'

export function CarryoverListPage() {
  const styles = useReorderStore(s => s.styles)
  const [search, setSearch] = useState('')

  // 캐리오버 뱃지가 붙은 스타일만
  const carryoverStyles = styles.filter(st => st.badges.includes('carryover'))

  const filtered = carryoverStyles.filter(st =>
    search.trim() === '' || st.code.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 max-w-4xl space-y-5" style={{ fontFamily: "'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif" }}>
      <div>
        <h1 className="text-lg font-bold text-slate-800">캐리오버 리스트 관리</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          캐리오버 뱃지가 붙은 스타일 목록입니다. MD들이 이 목록을 기준으로 캐리오버 발주를 관리합니다.
        </p>
      </div>

      {/* 검색 */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="스타일 코드 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-slate-200 rounded px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <span className="text-sm text-slate-400">{filtered.length}개 스타일</span>
      </div>

      {styles.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm bg-white border border-slate-200 rounded-lg">
          업로드된 데이터가 없습니다. 엑셀 파일을 업로드하면 자동으로 캐리오버 스타일이 분류됩니다.
        </div>
      ) : carryoverStyles.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm bg-white border border-slate-200 rounded-lg">
          캐리오버 뱃지가 붙은 스타일이 없습니다.
          <div className="text-xs mt-1 text-slate-300">스타일 코드에 Q 접미사가 있는 스타일이 캐리오버로 분류됩니다.</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-sm">검색 결과가 없습니다.</div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-2.5 text-left font-semibold text-slate-600">스타일 코드</th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-600">뱃지</th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-600">PLC</th>
                <th className="px-4 py-2.5 text-right font-semibold text-slate-600">가격</th>
                <th className="px-4 py-2.5 text-right font-semibold text-slate-600">컬러 수</th>
                <th className="px-4 py-2.5 text-right font-semibold text-slate-600">신규 제안 합계</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((style, i) => {
                const sumNew = style.colors.reduce((a, c) => a + (c.calcNew ?? 0), 0)
                const plcColor: Record<string, string> = {
                  '도입기': 'bg-emerald-50 text-emerald-700 border-emerald-200',
                  '성장기': 'bg-blue-50 text-blue-700 border-blue-200',
                  '유지기': 'bg-orange-50 text-orange-700 border-orange-200',
                  '쇠퇴기': 'bg-red-50 text-red-700 border-red-200',
                }
                return (
                  <tr key={style.id} className={cn('border-b border-slate-100', i % 2 !== 0 && 'bg-slate-50/40')}>
                    <td className="px-4 py-2.5 font-mono font-semibold text-slate-800">{style.code}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1 flex-wrap">
                        {style.badges.map(b => (
                          <span key={b} className={cn('text-xs px-1.5 py-0 rounded border font-semibold leading-5', STYLE_BADGE_COLORS[b])}>
                            {STYLE_BADGE_LABELS[b]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn('text-xs px-1.5 py-0 rounded border font-semibold leading-5', plcColor[style.plc] ?? '')}>
                        {style.plc}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                      ₩{style.price.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-500">{style.colors.length}개</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-blue-700">
                      {sumNew > 0 ? sumNew.toLocaleString() + ' pcs' : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
