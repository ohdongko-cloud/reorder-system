'use client'

import { useState } from 'react'
import { useReorderStore } from '@/store/reorder-store'
import { STYLE_BADGE_COLORS, STYLE_BADGE_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { Plus, X, Search } from 'lucide-react'

const GOTHIC = "'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif"

type CarryType = 'QR' | 'RE' | 'Carry'
type OpStatus  = '운영중' | '종료'

interface CarryoverEntry {
  id: string
  styleCode: string
  season: string
  type: CarryType
  startDate: string
  endDate: string
  status: OpStatus
  memo: string
}

const SEASON_OPTIONS = ['2026 1시즌', '2026 2시즌', '2026 3시즌', '2026 4시즌', '2025 1시즌', '2025 2시즌', '2025 3시즌', '2025 4시즌']

function genId() { return Math.random().toString(36).slice(2, 10) }

export function CarryoverListPage() {
  const styles = useReorderStore(s => s.styles)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)

  // 로컬 등록 데이터 (추후 DB 연동)
  const [entries, setEntries] = useState<CarryoverEntry[]>([])

  // 폼 상태
  const [form, setForm] = useState<Omit<CarryoverEntry, 'id'>>({
    styleCode: '', season: '2026 2시즌', type: 'Carry',
    startDate: '', endDate: '', status: '운영중', memo: '',
  })

  // 업로드된 데이터에서 캐리오버 스타일
  const uploadedCarryover = styles.filter(st => st.badges.includes('carryover'))

  // 등록된 엔트리 필터
  const filteredEntries = entries.filter(e =>
    search.trim() === '' || e.styleCode.toLowerCase().includes(search.toLowerCase())
  )

  function handleAdd() {
    if (!form.styleCode.trim()) return
    setEntries(prev => [...prev, { ...form, id: genId(), styleCode: form.styleCode.trim().toUpperCase() }])
    setForm({ styleCode: '', season: '2026 2시즌', type: 'Carry', startDate: '', endDate: '', status: '운영중', memo: '' })
    setShowForm(false)
  }

  function handleRemove(id: string) {
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  function toggleStatus(id: string) {
    setEntries(prev => prev.map(e => e.id !== id ? e : { ...e, status: e.status === '운영중' ? '종료' : '운영중' }))
  }

  const typeCls: Record<CarryType, string> = {
    QR:    'bg-purple-100 text-purple-800 border-purple-300',
    RE:    'bg-emerald-100 text-emerald-800 border-emerald-300',
    Carry: 'bg-blue-100 text-blue-800 border-blue-300',
  }

  return (
    <div className="p-6 max-w-5xl space-y-6" style={{ fontFamily: GOTHIC }}>
      <div>
        <h1 className="text-lg font-bold text-slate-800">캐리오버 리스트 관리</h1>
        <p className="text-sm text-slate-500 mt-0.5">캐리오버·QR·RE 운영 스타일을 MD가 직접 등록·관리합니다.</p>
      </div>

      {/* ── 업로드 데이터에서 자동 분류된 캐리오버 ── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-700">자동 분류된 캐리오버 스타일</h2>
          <span className="text-xs text-slate-400">스타일코드 접미사 기준 자동 추출 · {uploadedCarryover.length}개</span>
        </div>
        {styles.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm bg-white border border-slate-200 rounded-lg">
            업로드된 데이터가 없습니다. 엑셀 파일을 업로드하면 자동 분류됩니다.
          </div>
        ) : uploadedCarryover.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm bg-white border border-slate-200 rounded-lg">
            캐리오버 스타일이 없습니다. (스타일코드에 Q 접미사 있는 경우 자동 분류)
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs">
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">스타일 코드</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">뱃지</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">PLC</th>
                  <th className="px-4 py-2 text-right font-semibold text-slate-600">가격</th>
                  <th className="px-4 py-2 text-right font-semibold text-slate-600">컬러 수</th>
                  <th className="px-4 py-2 text-right font-semibold text-slate-600">신규 제안 합계</th>
                </tr>
              </thead>
              <tbody>
                {uploadedCarryover.map((style, i) => {
                  const sumNew = style.colors.reduce((a, c) => a + (c.calcNew ?? 0), 0)
                  const plcCls: Record<string, string> = {
                    '도입기': 'bg-emerald-50 text-emerald-700 border-emerald-200',
                    '성장기': 'bg-blue-50 text-blue-700 border-blue-200',
                    '유지기': 'bg-orange-50 text-orange-700 border-orange-200',
                    '쇠퇴기': 'bg-red-50 text-red-700 border-red-200',
                  }
                  return (
                    <tr key={style.id} className={cn('border-b border-slate-100', i % 2 !== 0 && 'bg-slate-50/40')}>
                      <td className="px-4 py-2 font-mono font-semibold text-slate-800">{style.code}</td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1 flex-wrap">
                          {style.badges.map(b => (
                            <span key={b} className={cn('text-xs px-1.5 rounded border font-semibold leading-5', STYLE_BADGE_COLORS[b])}>
                              {STYLE_BADGE_LABELS[b]}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <span className={cn('text-xs px-1.5 rounded border font-semibold leading-5', plcCls[style.plc] ?? '')}>
                          {style.plc}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600">₩{style.price.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right text-slate-500">{style.colors.length}개</td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold text-blue-700">
                        {sumNew > 0 ? sumNew.toLocaleString() + ' pcs' : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── MD 직접 등록 ── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-700">MD 직접 등록 리스트</h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="스타일 코드 검색..."
                className="border border-slate-200 rounded pl-7 pr-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <button
              onClick={() => setShowForm(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />스타일 등록
            </button>
          </div>
        </div>

        {/* 등록 폼 */}
        {showForm && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-blue-800">새 캐리오버 스타일 등록</span>
              <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-blue-400 hover:text-blue-600" /></button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-600 block mb-1 font-semibold">스타일 코드 *</label>
                <input value={form.styleCode} onChange={e => setForm(f => ({ ...f, styleCode: e.target.value }))}
                  placeholder="예) MIWCKG510T"
                  className="w-full border border-slate-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" />
              </div>
              <div>
                <label className="text-xs text-slate-600 block mb-1 font-semibold">시즌</label>
                <select value={form.season} onChange={e => setForm(f => ({ ...f, season: e.target.value }))}
                  className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                  {SEASON_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-600 block mb-1 font-semibold">유형</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as CarryType }))}
                  className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                  <option value="Carry">캐리오버 (Carry)</option>
                  <option value="QR">QR테스트</option>
                  <option value="RE">RE</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-600 block mb-1 font-semibold">운영 시작일</label>
                <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  className="w-full border border-slate-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" />
              </div>
              <div>
                <label className="text-xs text-slate-600 block mb-1 font-semibold">운영 종료일</label>
                <input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                  className="w-full border border-slate-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" />
              </div>
              <div>
                <label className="text-xs text-slate-600 block mb-1 font-semibold">메모</label>
                <input value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                  placeholder="선택 사항"
                  className="w-full border border-slate-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowForm(false)} className="px-4 py-1.5 rounded border border-slate-300 text-sm text-slate-600 hover:bg-white">취소</button>
              <button onClick={handleAdd} disabled={!form.styleCode.trim()}
                className="px-4 py-1.5 rounded bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
                등록
              </button>
            </div>
          </div>
        )}

        {/* 등록된 목록 */}
        {filteredEntries.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm bg-white border border-slate-200 rounded-lg">
            {entries.length === 0 ? (
              <>
                <div className="text-2xl mb-2">📋</div>
                <div>등록된 캐리오버 스타일이 없습니다.</div>
                <div className="text-xs mt-1 text-slate-300">위 &quot;스타일 등록&quot; 버튼으로 추가할 수 있습니다.</div>
              </>
            ) : '검색 결과가 없습니다.'}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs">
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">스타일 코드</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">시즌</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">유형</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">운영 시작일</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">운영 종료일</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">상태</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">메모</th>
                  <th className="px-4 py-2 text-center font-semibold text-slate-600">액션</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry, i) => (
                  <tr key={entry.id} className={cn('border-b border-slate-100', i % 2 !== 0 && 'bg-slate-50/40')}>
                    <td className="px-4 py-2 font-mono font-semibold text-slate-800">{entry.styleCode}</td>
                    <td className="px-4 py-2 text-slate-600">{entry.season}</td>
                    <td className="px-4 py-2">
                      <span className={cn('text-xs px-1.5 rounded border font-semibold leading-5', typeCls[entry.type])}>
                        {entry.type}
                      </span>
                    </td>
                    <td className="px-4 py-2 tabular-nums text-slate-500">{entry.startDate || '—'}</td>
                    <td className="px-4 py-2 tabular-nums text-slate-500">{entry.endDate || '—'}</td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => toggleStatus(entry.id)}
                        className={cn(
                          'text-xs px-2 py-0.5 rounded-full border font-semibold transition-colors',
                          entry.status === '운영중'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                            : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                        )}
                      >
                        {entry.status}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-slate-500 text-xs max-w-[120px] truncate">{entry.memo || '—'}</td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => handleRemove(entry.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
