'use client'

import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useReorderStore } from '@/store/reorder-store'
import { calcNew, calcOld } from '@/lib/reorder-calc'
import { PLC_COLORS, STORE_EXPANSION_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { ColorRow, StyleRow, PrevYearStyleCandidate, StoreExpansion } from '@/types/reorder'

interface Props {
  open: boolean
  onClose: () => void
  color: ColorRow
  style: StyleRow
}

// ── 한국어 상품명 유사도 (바이그램 Jaccard) ──────────────────────────────────
function koreanNameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  const aNorm = a.replace(/\s+/g, '').toLowerCase()
  const bNorm = b.replace(/\s+/g, '').toLowerCase()
  if (aNorm === bNorm) return 1

  // 바이그램 집합 생성
  function bigrams(s: string): Set<string> {
    const set = new Set<string>()
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2))
    if (s.length === 1) set.add(s)  // 한 글자짜리도 포함
    return set
  }
  const aG = bigrams(aNorm)
  const bG = bigrams(bNorm)
  let intersection = 0
  aG.forEach(g => { if (bG.has(g)) intersection++ })
  const union = aG.size + bG.size - intersection
  return union > 0 ? intersection / union : 0
}

// ── WeeklyBarChart SVG ────────────────────────────────────────────────────────
function WeeklyBarChart({ data, color = '#3b82f6' }: { data: number[]; color?: string }) {
  const max = Math.max(...data, 1)
  const w = 200
  const h = 48
  const gap = 2
  const barW = (w - gap * (data.length - 1)) / data.length

  return (
    <svg width={w} height={h} className="block">
      {data.map((v, i) => {
        const bh = Math.max(2, (v / max) * (h - 4))
        const x = i * (barW + gap)
        const y = h - bh
        return <rect key={i} x={x} y={y} width={barW} height={bh} fill={color} rx={1} />
      })}
    </svg>
  )
}

// ── Slider Field ─────────────────────────────────────────────────────────────
function SliderField({
  label,
  sub,
  value,
  min,
  max,
  step,
  display,
  onChange,
  ticks,
}: {
  label: string
  sub: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (v: number) => void
  ticks?: string[]
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-baseline">
        <div>
          <span className="text-xs font-semibold text-slate-700">{label}</span>
          <span className="text-[10px] text-slate-400 ml-1.5">{sub}</span>
        </div>
        <span className="text-sm font-bold text-blue-600 tabular-nums min-w-[3rem] text-right">{display}</span>
      </div>
      <input
        type="range"
        min={min * 100}
        max={max * 100}
        step={step * 100}
        value={value * 100}
        onChange={e => onChange(Number(e.target.value) / 100)}
        className="w-full h-1.5 accent-blue-500"
      />
      {ticks && (
        <div className="flex justify-between text-[9px] text-slate-400">
          {ticks.map((t, i) => <span key={i}>{t}</span>)}
        </div>
      )}
    </div>
  )
}

// ── 전년 상품 유사도 검색 ─────────────────────────────────────────────────────
function usePrevYearMatches(style: StyleRow, searchQuery: string): PrevYearStyleCandidate[] {
  const candidates = useReorderStore(s => s.prevYearCandidates)
  return useMemo(() => {
    if (candidates.length === 0) return []
    const query = searchQuery.trim()

    let scored: Array<{ c: PrevYearStyleCandidate; score: number }>

    if (query) {
      // 검색어 있으면: 상품명 + 코드 모두 검색
      const qLow = query.toLowerCase()
      scored = candidates.map(c => {
        const nameScore = koreanNameSimilarity(query, c.styleName)
        const codeMatch = c.styleCode.toLowerCase().includes(qLow) ? 0.8 : 0
        const nameContains = c.styleName.includes(query) ? 0.6 : 0
        return { c, score: Math.max(nameScore, codeMatch, nameContains) }
      }).filter(x => x.score > 0)
    } else {
      // 검색어 없으면: 현재 스타일명(있으면) 또는 코드로 유사도 계산
      const refName = style.name ?? ''
      scored = candidates.map(c => {
        const score = refName
          ? koreanNameSimilarity(refName, c.styleName)
          : 0.1  // 이름 없으면 모두 동일 순위
        return { c, score }
      })
    }

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, 5).map(x => x.c)
  }, [candidates, style.name, style.code, searchQuery])
}

// ── Main Modal ────────────────────────────────────────────────────────────────
export function TModal({ open, onClose, color, style }: Props) {
  const updateColorField = useReorderStore(s => s.updateColorField)
  const setStylePrevYear = useReorderStore(s => s.setStylePrevYear)
  const setStyleStoreExpansion = useReorderStore(s => s.setStyleStoreExpansion)

  const [localT, setLocalT] = useState(color.t)
  const [localS, setLocalS] = useState(color.s)
  const [localR, setLocalR] = useState(color.r)
  const [localW, setLocalW] = useState(color.weight ?? 1.0)
  const [localStoreExpansion, setLocalStoreExpansion] = useState<StoreExpansion>(style.store_expansion ?? 'expand')
  const [selectedCandidate, setSelectedCandidate] = useState<PrevYearStyleCandidate | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (open) {
      setLocalT(color.t)
      setLocalS(color.s)
      setLocalR(color.r)
      setLocalW(color.weight ?? 1.0)
      setLocalStoreExpansion(style.store_expansion ?? 'expand')
      setSelectedCandidate(null)
      setSearchQuery('')
    }
  }, [open, color.t, color.s, color.r, color.weight, style.store_expansion])

  const prevYearMatches = usePrevYearMatches(style, searchQuery)
  const hasCandidates = useReorderStore(s => s.prevYearCandidates.length > 0)

  // current preview
  const previewOld = calcOld(color.l, color.m, color.n, color.r, color.s, color.t, style.stores)
  const previewNew = calcNew(
    color.l, color.m, color.n, localR, localS, localT,
    style.stores, style.plc, style.days_since_inbound, style.strategy
  )

  const oldAd = previewOld?.ad ?? null
  const newAd = previewNew?.ad ?? null
  const changePct = (oldAd && newAd && oldAd > 0)
    ? ((newAd - oldAd) / oldAd * 100)
    : null

  function handleSelectCard(entry: PrevYearStyleCandidate) {
    setSelectedCandidate(entry)
    // 전년 잔여 주수를 S에 반영 (0이면 기존값 유지)
    if (entry.estRemainWeeks > 0) setLocalS(entry.estRemainWeeks)
  }

  function handleConfirm() {
    updateColorField(style.id, color.id, 't', localT)
    updateColorField(style.id, color.id, 's', localS)
    updateColorField(style.id, color.id, 'r', localR)
    updateColorField(style.id, color.id, 'weight', localW)
    // 선택된 전년 상품의 데이터를 스타일에 매칭
    if (selectedCandidate) {
      setStylePrevYear(style.id, selectedCandidate.prevYearData)
    }
    setStyleStoreExpansion(style.id, localStoreExpansion)
    onClose()
  }

  const plcCls = PLC_COLORS[style.plc] ?? ''

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-[92vw] w-[92vw] p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-slate-100">
          <DialogTitle className="text-sm flex items-center gap-2">
            <span>📅 전년 유사상품 선택</span>
            <span className="text-slate-400">—</span>
            <span className="font-mono text-slate-600">{style.code}</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-600">{color.color_name}</span>
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-semibold ml-1', plcCls)}>
              {style.plc}
            </span>
            <span className="text-[10px] text-slate-400 ml-0.5">경과 {style.days_since_inbound}일</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex divide-x divide-slate-100" style={{ height: '88vh', overflowY: 'auto' }}>

          {/* ── LEFT PANEL ── */}
          <div className="w-[300px] shrink-0 px-5 py-4 space-y-5">
            <div>
              <p className="text-[11px] font-semibold text-slate-600 mb-3">파라미터 조정</p>

              <div className="space-y-4">
                <SliderField
                  label="T · 입고배율"
                  sub="입고 후 주판량 배수"
                  value={localT}
                  min={0.5} max={3.0} step={0.05}
                  display={localT.toFixed(2)}
                  onChange={setLocalT}
                  ticks={['0.5', '1.0', '1.5', '2.0', '2.5', '3.0']}
                />
                <SliderField
                  label="S · 잔여판매주"
                  sub="남은 판매 기간(주)"
                  value={localS}
                  min={1} max={52} step={1}
                  display={`${localS}주`}
                  onChange={setLocalS}
                  ticks={['1w', '13w', '26w', '39w', '52w']}
                />
                <SliderField
                  label="R · 재고보정배수"
                  sub="현재재고 조정 계수"
                  value={localR}
                  min={0.5} max={3.0} step={0.1}
                  display={localR.toFixed(1) + 'x'}
                  onChange={setLocalR}
                  ticks={['0.5x', '1.0x', '1.5x', '2.0x', '2.5x', '3.0x']}
                />
                <SliderField
                  label="W · 발주 가중치"
                  sub="발주 수량 조정 계수"
                  value={localW}
                  min={1.0} max={2.0} step={0.1}
                  display={localW.toFixed(1) + 'x'}
                  onChange={setLocalW}
                  ticks={['1.0x', '1.3x', '1.5x', '1.7x', '2.0x']}
                />
              </div>
            </div>

            {/* 점포 확장/유지/축소 */}
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-700">점포 배분 계획</div>
              <div className="flex gap-1.5">
                {(['expand', 'maintain', 'reduce'] as StoreExpansion[]).map(opt => (
                  <button
                    key={opt}
                    onClick={() => setLocalStoreExpansion(opt)}
                    className={cn(
                      'flex-1 py-1.5 rounded text-[10px] font-semibold border transition-colors',
                      localStoreExpansion === opt
                        ? opt === 'expand' ? 'bg-blue-600 text-white border-blue-600'
                          : opt === 'maintain' ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-amber-600 text-white border-amber-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                    )}
                  >
                    {STORE_EXPANSION_LABELS[opt]}
                  </button>
                ))}
              </div>
              <div className="text-[9px] text-slate-400">
                {localStoreExpansion === 'expand' && '전체 매장(50개) 기준 확장 발주'}
                {localStoreExpansion === 'maintain' && '현재 운영 매장 수 기준 발주 (확장 없음)'}
                {localStoreExpansion === 'reduce' && '현재 매장의 70% 기준 발주 (축소)'}
              </div>
            </div>

            {/* Preview box */}
            <div className="rounded-lg bg-slate-800 text-white px-4 py-3 space-y-2.5">
              <p className="text-[10px] font-semibold text-slate-300 uppercase tracking-wide">실시간 미리보기</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[9px] text-slate-400 mb-0.5">기존 추천</div>
                  <div className="text-base font-bold tabular-nums text-slate-100">
                    {oldAd != null ? oldAd.toLocaleString() : '—'}
                  </div>
                  <div className="text-[9px] text-slate-500">개</div>
                </div>
                <div className="flex items-center justify-center">
                  <span className="text-slate-500 text-lg">→</span>
                </div>
                <div>
                  <div className="text-[9px] text-slate-400 mb-0.5">조정후 신규</div>
                  <div className="text-base font-bold tabular-nums text-blue-300">
                    {newAd != null ? newAd.toLocaleString() : '—'}
                  </div>
                  <div className="text-[9px] text-slate-500">개</div>
                </div>
              </div>
              {changePct != null && (
                <div className={cn(
                  'text-center text-sm font-bold tabular-nums pt-1 border-t border-slate-700',
                  changePct > 0 ? 'text-orange-400' : changePct < 0 ? 'text-blue-400' : 'text-slate-400'
                )}>
                  {changePct > 0 ? '▲' : changePct < 0 ? '▼' : ''}
                  {Math.abs(changePct).toFixed(1)}%
                  <span className="text-[9px] font-normal text-slate-500 ml-1">변화율</span>
                </div>
              )}
            </div>

            {/* Confirm button */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-2 rounded border border-slate-300 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
              >취소</button>
              <button
                onClick={handleConfirm}
                className="flex-1 py-2 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
              >이 파라미터로 적용</button>
            </div>
          </div>

          {/* ── RIGHT PANEL ── */}
          <div className="flex-1 min-w-0 px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold text-slate-600">
                전년 유사 상품 선택
                <span className="text-[10px] font-normal text-slate-400 ml-1.5">
                  상품명 유사도 상위 5개 · 선택 시 S값 및 전년 데이터 자동 적용
                </span>
              </p>
            </div>

            {/* 검색 입력 */}
            <div className="mb-3">
              <input
                type="text"
                placeholder="상품명 또는 스타일코드 검색..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full border border-slate-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-slate-300"
              />
            </div>

            {/* 전년 상품 후보 카드 */}
            {prevYearMatches.length > 0 ? (
              <div className="space-y-2">
                {prevYearMatches.map((entry, i) => {
                  const isSelected = selectedCandidate?.styleCode === entry.styleCode
                  const salesPct = Math.round(entry.cumSalesRate)
                  const chartData = entry.weeklyNormSales.length > 0
                    ? entry.weeklyNormSales
                    : []

                  return (
                    <button
                      key={i}
                      onClick={() => handleSelectCard(entry)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all',
                        isSelected
                          ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-300'
                          : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40'
                      )}
                    >
                      {/* Radio dot */}
                      <div className={cn(
                        'w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center',
                        isSelected ? 'border-blue-500' : 'border-slate-300'
                      )}>
                        {isSelected && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                      </div>

                      {/* 상품명 + 코드 + 실적 */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[11px] font-semibold text-slate-800 truncate max-w-[160px]">{entry.styleName}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="font-mono text-[10px] text-slate-500">{entry.styleCode}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500">
                          <span className="text-slate-400">주판량</span>
                          <span className="font-semibold text-slate-700">{entry.weekNormSalesQty.toLocaleString()}</span>
                          <span className="text-slate-300">|</span>
                          <span className="text-slate-400">판매율</span>
                          <span className={cn('font-semibold', salesPct >= 70 ? 'text-emerald-600' : salesPct >= 40 ? 'text-blue-600' : 'text-red-500')}>
                            {salesPct}%
                          </span>
                          {entry.estRemainWeeks > 0 && (
                            <>
                              <span className="text-slate-300">|</span>
                              <span className="text-slate-400">잔여</span>
                              <span className="font-semibold text-amber-600">{entry.estRemainWeeks}주</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* 전년 PLC 바 차트 */}
                      {chartData.length > 0 && (
                        <div className="shrink-0">
                          <div className="text-[9px] text-slate-400 text-center mb-0.5">전년 주별 판매</div>
                          <WeeklyBarChart
                            data={chartData.slice(0, 16)}
                            color={isSelected ? '#3b82f6' : '#94a3b8'}
                          />
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="text-2xl mb-2">🔍</div>
                <div className="text-[11px] text-slate-400">
                  {!hasCandidates
                    ? '전년 데이터가 없습니다 (BI_스타일별전년 시트 필요)'
                    : '검색 결과가 없습니다'}
                </div>
                <div className="text-[10px] text-slate-300 mt-1">위 검색창에서 상품명 또는 스타일코드를 입력해보세요</div>
              </div>
            )}

            {/* 선택 완료 안내 */}
            {selectedCandidate && (
              <div className="mt-3 px-3 py-2 rounded bg-blue-50 border border-blue-200 text-[10px] text-blue-700">
                <span className="font-semibold">{selectedCandidate.styleName}</span>
                {' '}({selectedCandidate.styleCode})가 선택되었습니다.
                {selectedCandidate.estRemainWeeks > 0 && (
                  <span> S={selectedCandidate.estRemainWeeks}주로 자동 설정됨.</span>
                )}
                {' '}확인 후 <span className="font-semibold">이 파라미터로 적용</span>을 눌러주세요.
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
