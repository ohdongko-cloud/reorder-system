'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useReorderStore } from '@/store/reorder-store'
import { calcNew, calcOld } from '@/lib/reorder-calc'
import { PLC_COLORS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { ColorRow, StyleRow } from '@/types/reorder'

interface Props {
  open: boolean
  onClose: () => void
  color: ColorRow
  style: StyleRow
}

// ── Mock weekly sales (16 weeks, seeded by code + PLC) ────────────────────────
function seededRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

function mockWeeklySales(code: string, plc: string): number[] {
  const seed = code.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7)
  const rng = seededRandom(seed)
  const base = Math.floor(rng() * 600) + 200 // 200~800

  return Array.from({ length: 16 }, (_, i) => {
    let factor: number
    const t = i / 15 // 0→1

    if (plc === '도입기') {
      factor = 0.4 + t * 1.2
    } else if (plc === '성장기') {
      const peak = 0.55
      factor = 1 - Math.pow((t - peak) / peak, 2) * 0.6
    } else if (plc === '유지기') {
      factor = 0.85 + (rng() - 0.5) * 0.2
    } else {
      // 쇠퇴기
      factor = 1.2 - t * 0.9
    }
    const noise = (rng() - 0.5) * 0.25
    return Math.max(0, Math.round(base * (factor + noise)))
  })
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

// ── Similar style search ──────────────────────────────────────────────────────
function computeCodeSimilarity(a: string, b: string): number {
  const aLow = a.toLowerCase()
  const bLow = b.toLowerCase()
  let prefix = 0
  const minLen = Math.min(aLow.length, bLow.length)
  for (let i = 0; i < minLen; i++) {
    if (aLow[i] === bLow[i]) prefix++
    else break
  }
  const aSet = new Set(aLow.split(''))
  const bSet = new Set(bLow.split(''))
  let shared = 0
  aSet.forEach(c => { if (bSet.has(c)) shared++ })
  const charOverlap = shared / Math.max(aSet.size, bSet.size)
  return (prefix / Math.max(a.length, b.length)) * 0.7 + charOverlap * 0.3
}

interface SimilarEntry {
  code: string
  color: string
  plc: string
  t: number
  s: number
  r: number
  calcNew: number | null
  similarity: number
  weeklySales: number[]
}

function useSimilarStyles(style: StyleRow): SimilarEntry[] {
  const styles = useReorderStore(s => s.styles)
  const candidates: SimilarEntry[] = []

  for (const s of styles) {
    if (s.id === style.id) continue
    const sim = computeCodeSimilarity(style.code, s.code)
    if (sim < 0.25) continue

    for (const c of s.colors) {
      candidates.push({
        code: s.code,
        color: c.color_name,
        plc: s.plc,
        t: c.t,
        s: c.s,
        r: c.r,
        calcNew: c.calcNew ?? null,
        similarity: sim,
        weeklySales: mockWeeklySales(s.code, s.plc),
      })
    }
  }

  candidates.sort((a, b) => b.similarity - a.similarity)
  const seen = new Set<string>()
  const result: SimilarEntry[] = []
  for (const c of candidates) {
    if (seen.has(c.code)) continue
    seen.add(c.code)
    result.push(c)
    if (result.length >= 5) break
  }
  return result
}

// ── Main Modal ────────────────────────────────────────────────────────────────
export function TModal({ open, onClose, color, style }: Props) {
  const updateColorField = useReorderStore(s => s.updateColorField)

  const [localT, setLocalT] = useState(color.t)
  const [localS, setLocalS] = useState(color.s)
  const [localR, setLocalR] = useState(color.r)
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [directCode, setDirectCode] = useState('')

  useEffect(() => {
    if (open) {
      setLocalT(color.t)
      setLocalS(color.s)
      setLocalR(color.r)
      setSelectedCode(null)
      setDirectCode('')
    }
  }, [open, color.t, color.s, color.r])

  const similar = useSimilarStyles(style)

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

  function handleSelectCard(entry: SimilarEntry) {
    setSelectedCode(entry.code)
    setLocalT(entry.t)
    setLocalS(entry.s)
    setLocalR(entry.r)
  }

  function handleConfirm() {
    updateColorField(style.id, color.id, 't', localT)
    updateColorField(style.id, color.id, 's', localS)
    updateColorField(style.id, color.id, 'r', localR)
    onClose()
  }

  const plcCls = PLC_COLORS[style.plc] ?? ''

  const plcBarColor: Record<string, string> = {
    '도입기': '#10b981',
    '성장기': '#3b82f6',
    '유지기': '#f97316',
    '쇠퇴기': '#ef4444',
  }
  const chartColor = plcBarColor[style.plc] ?? '#3b82f6'

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-[880px] w-[96vw] p-0 overflow-hidden">
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

        <div className="flex divide-x divide-slate-100" style={{ maxHeight: '76vh', overflowY: 'auto' }}>

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
                유사 스타일 참고
                <span className="text-[10px] font-normal text-slate-400 ml-1.5">
                  스타일 코드 일치도 상위 5개 · 클릭 시 파라미터 자동 적용
                </span>
              </p>
            </div>

            {/* Similar product radio cards */}
            {similar.length > 0 ? (
              <div className="space-y-2">
                {similar.map((entry, i) => {
                  const isSelected = selectedCode === entry.code
                  const pct = Math.round(entry.similarity * 100)
                  const plcColor: Record<string, string> = {
                    '도입기': 'bg-emerald-50 text-emerald-700 border-emerald-200',
                    '성장기': 'bg-blue-50 text-blue-700 border-blue-200',
                    '유지기': 'bg-orange-50 text-orange-700 border-orange-200',
                    '쇠퇴기': 'bg-red-50 text-red-700 border-red-200',
                  }
                  const cardBarColor = plcBarColor[entry.plc] ?? '#3b82f6'

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

                      {/* Code + meta */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="font-mono text-[11px] font-semibold text-slate-800 truncate">{entry.code}</span>
                          <span className={cn('text-[9px] px-1 py-0.5 rounded border font-semibold shrink-0', plcColor[entry.plc] ?? '')}>
                            {entry.plc}
                          </span>
                          <span className="text-[9px] text-slate-400 shrink-0">일치 {pct}%</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500">
                          <span>T={entry.t.toFixed(2)}</span>
                          <span className="text-slate-300">|</span>
                          <span>S={entry.s}주</span>
                          <span className="text-slate-300">|</span>
                          <span>R={entry.r.toFixed(1)}x</span>
                          {entry.calcNew != null && (
                            <>
                              <span className="text-slate-300">|</span>
                              <span className="text-blue-600 font-semibold">{entry.calcNew.toLocaleString()}개</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* 16-week bar chart */}
                      <div className="shrink-0">
                        <div className="text-[9px] text-slate-400 text-center mb-0.5">16주 판매 추이</div>
                        <WeeklyBarChart data={entry.weeklySales} color={isSelected ? '#3b82f6' : cardBarColor + '99'} />
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="text-2xl mb-2">🔍</div>
                <div className="text-[11px] text-slate-400">일치도 25% 이상인 유사 스타일이 없습니다</div>
                <div className="text-[10px] text-slate-300 mt-1">아래에서 스타일 코드를 직접 입력해보세요</div>
              </div>
            )}

            {/* Direct code input */}
            <div className="mt-4 pt-3 border-t border-slate-100">
              <p className="text-[10px] text-slate-500 mb-1.5">또는 스타일 코드 직접 입력</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="예) 24SS-TOP-001"
                  value={directCode}
                  onChange={e => setDirectCode(e.target.value)}
                  className="flex-1 border border-slate-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-slate-300"
                />
                <button
                  disabled={!directCode.trim()}
                  onClick={() => {
                    // In future, look up style by code from store
                    setSelectedCode(directCode.trim())
                  }}
                  className="px-3 py-1.5 rounded bg-slate-700 text-white text-xs font-medium hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  참고 적용
                </button>
              </div>
            </div>

            {/* Selected card summary */}
            {selectedCode && (
              <div className="mt-3 px-3 py-2 rounded bg-blue-50 border border-blue-200 text-[10px] text-blue-700">
                <span className="font-semibold">{selectedCode}</span>
                {' '}의 T/S/R 값이 왼쪽 슬라이더에 반영되었습니다.
                확인 후 <span className="font-semibold">이 파라미터로 적용</span>을 눌러주세요.
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
