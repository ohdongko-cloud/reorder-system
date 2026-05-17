'use client'

import { useState } from 'react'
import { useReorderStore } from '@/store/reorder-store'
import { cn } from '@/lib/utils'
import { Search, X } from 'lucide-react'
import type { StyleRow } from '@/types/reorder'

const MAX_CODES = 5

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString()
}

export function StyleSearchPage() {
  const styles = useReorderStore(s => s.styles)

  const [inputs, setInputs] = useState<string[]>([''])
  const [results, setResults] = useState<StyleRow[]>([])
  const [searched, setSearched] = useState(false)

  function addInput() {
    if (inputs.length < MAX_CODES) setInputs(prev => [...prev, ''])
  }

  function removeInput(i: number) {
    setInputs(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateInput(i: number, val: string) {
    setInputs(prev => prev.map((v, idx) => idx === i ? val.toUpperCase() : v))
  }

  function handleSearch() {
    const codes = inputs.map(s => s.trim()).filter(Boolean)
    if (codes.length === 0) return

    const found = styles.filter(s =>
      codes.some(code => s.code.toUpperCase().includes(code))
    )
    setResults(found)
    setSearched(true)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSearch()
  }

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-slate-800">스타일 검색</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          스타일 코드를 입력하면 해당 상품의 리오더 추천 수량을 조회합니다. (최대 {MAX_CODES}개)
        </p>
      </div>

      {/* Search inputs */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="space-y-2">
          {inputs.map((val, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-slate-400 w-4 text-right">{i + 1}</span>
              <input
                type="text"
                placeholder="예: MI24SS001"
                value={val}
                onChange={e => updateInput(i, e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 border border-slate-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 font-mono"
              />
              {inputs.length > 1 && (
                <button onClick={() => removeInput(i)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-1">
          {inputs.length < MAX_CODES && (
            <button
              onClick={addInput}
              className="text-xs text-blue-600 hover:text-blue-700 border border-blue-200 rounded px-2.5 py-1 hover:bg-blue-50"
            >
              + 코드 추가
            </button>
          )}
          <button
            onClick={handleSearch}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700"
          >
            <Search className="w-3.5 h-3.5" />
            검색
          </button>
        </div>
      </div>

      {/* Results */}
      {searched && (
        <div>
          <div className="text-sm font-semibold text-slate-700 mb-3">
            검색 결과 <span className="text-slate-400 font-normal">— {results.length}개 스타일</span>
          </div>

          {results.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm bg-white border border-slate-200 rounded-lg">
              일치하는 스타일 코드가 없습니다.
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-800 text-slate-100">
                    <th className="px-3 py-2 text-left font-semibold">스타일코드</th>
                    <th className="px-3 py-2 text-left font-semibold">컬러</th>
                    <th className="px-3 py-2 text-center font-semibold">PLC</th>
                    <th className="px-3 py-2 text-right font-semibold border-l-2 border-slate-600">기존 추천(개)</th>
                    <th className="px-3 py-2 text-right font-semibold text-blue-300 border-l-2 border-slate-600">신규 추천(개)</th>
                    <th className="px-3 py-2 text-right font-semibold border-l border-slate-600">vs 기존</th>
                    <th className="px-3 py-2 text-right font-semibold border-l-2 border-slate-600 text-emerald-300">확정발주(개)</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map(style =>
                    style.colors.map((color, ci) => {
                      const { calcOld, calcNew, delta } = color
                      const deltaSign = delta != null && delta >= 0 ? '+' : ''
                      const deltaCls = delta == null ? 'text-slate-400' :
                        delta > 5 ? 'text-red-600 font-semibold' :
                        delta < -5 ? 'text-blue-600 font-semibold' : 'text-slate-400'

                      return (
                        <tr key={color.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                          {ci === 0 && (
                            <td className="px-3 py-2 font-mono font-bold text-slate-800 align-top" rowSpan={style.colors.length}>
                              <div>{style.code}</div>
                              <StyleTypeBadge type={style.type} />
                              <div className="text-[10px] text-slate-400 mt-0.5">{style.stores}매장 · {style.days_since_inbound}일</div>
                            </td>
                          )}
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              {color.color_hex && (
                                <span className="w-2.5 h-2.5 rounded-full border border-black/10 shrink-0" style={{ background: color.color_hex }} />
                              )}
                              {color.color_name}
                            </div>
                          </td>
                          {ci === 0 && (
                            <td className="px-3 py-2 text-center align-top" rowSpan={style.colors.length}>
                              <PlcBadge plc={style.plc} />
                            </td>
                          )}
                          <td className="px-3 py-2 text-right tabular-nums border-l-2 border-slate-100">
                            {fmt(calcOld)}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-blue-700 tabular-nums border-l-2 border-slate-100">
                            {fmt(calcNew)}
                          </td>
                          <td className={cn('px-3 py-2 text-right tabular-nums border-l border-slate-100', deltaCls)}>
                            {delta != null ? `${deltaSign}${delta.toFixed(1)}%` : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-emerald-700 tabular-nums border-l-2 border-slate-100">
                            {color.aj > 0 ? color.aj.toLocaleString() : '—'}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StyleTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    normal:  { label: '일반', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    reorder: { label: '리오더', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    test_cn: { label: '사입', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  }
  const { label, cls } = map[type] ?? map.normal
  return <span className={cn('text-[10px] px-1.5 rounded border font-semibold mt-0.5 inline-block', cls)}>{label}</span>
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
