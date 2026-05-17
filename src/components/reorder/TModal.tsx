'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useReorderStore } from '@/store/reorder-store'
import { calcNew } from '@/lib/reorder-calc'
import { PLC_COLORS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { ColorRow, StyleRow } from '@/types/reorder'

interface Props {
  open: boolean
  onClose: () => void
  color: ColorRow
  style: StyleRow
}

// Mock "similar previous-season products" derived from store data
function useSimilarStyles(style: StyleRow, currentColorId: string) {
  const styles = useReorderStore(s => s.styles)
  // Find other colors/styles with similar characteristics (same PLC, close price)
  const similar: { code: string; color: string; t: number; calcNew: number | null }[] = []
  for (const s of styles) {
    if (s.id === style.id) continue
    if (s.plc !== style.plc) continue
    if (Math.abs(s.price - style.price) > 30000) continue
    for (const c of s.colors) {
      if (similar.length >= 3) break
      similar.push({ code: s.code, color: c.color_name, t: c.t, calcNew: c.calcNew ?? null })
    }
    if (similar.length >= 3) break
  }
  return similar
}

export function TModal({ open, onClose, color, style }: Props) {
  const updateColorField = useReorderStore(s => s.updateColorField)

  const [localT, setLocalT] = useState(color.t)
  const [localS, setLocalS] = useState(color.s)
  const [localR, setLocalR] = useState(color.r)

  useEffect(() => {
    if (open) {
      setLocalT(color.t)
      setLocalS(color.s)
      setLocalR(color.r)
    }
  }, [open, color.t, color.s, color.r])

  const similar = useSimilarStyles(style, color.id)

  // Real-time preview with current slider values
  const preview = calcNew(
    color.l, color.m, color.n, localR, localS, localT,
    style.stores, style.plc, style.days_since_inbound, style.strategy
  )

  function handleConfirm() {
    updateColorField(style.id, color.id, 't', localT)
    updateColorField(style.id, color.id, 's', localS)
    updateColorField(style.id, color.id, 'r', localR)
    onClose()
  }

  const plcCls = PLC_COLORS[style.plc] ?? ''

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">
            T값 / 입력 조정 — <span className="font-mono">{style.code}</span> · {color.color_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* PLC indicator */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">PLC 단계</span>
            <span className={cn('text-[11px] px-2 py-0.5 rounded border font-semibold', plcCls)}>
              {style.plc}
            </span>
            <span className="text-[11px] text-slate-400">경과 {style.days_since_inbound}일</span>
          </div>

          {/* Similar styles reference */}
          {similar.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-slate-600 mb-1.5">유사 스타일 참고</div>
              <div className="space-y-1">
                {similar.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setLocalT(s.t)}
                    className="w-full flex items-center justify-between px-3 py-1.5 rounded border border-slate-200 text-xs bg-slate-50 hover:bg-blue-50 hover:border-blue-300 transition-colors text-left"
                  >
                    <span className="font-mono text-slate-700">{s.code}</span>
                    <span className="text-slate-500">{s.color}</span>
                    <span className="text-blue-600 font-semibold">T={s.t.toFixed(1)}</span>
                    <span className="text-slate-400">{s.calcNew?.toLocaleString() ?? '—'}개</span>
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">클릭하면 T값이 적용됩니다</div>
            </div>
          )}

          {/* T slider */}
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">T값 (입고 후 주판량 배수)</label>
              <span className="text-sm font-bold text-blue-600 tabular-nums">{localT.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min={50} max={300} step={5}
              value={localT * 100}
              onChange={e => setLocalT(Number(e.target.value) / 100)}
              className="w-full h-2 accent-blue-500"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
              <span>0.5</span><span>1.0</span><span>1.5</span><span>2.0</span><span>2.5</span><span>3.0</span>
            </div>
          </div>

          {/* S / R inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-600 block mb-1">판매기간 S (주)</label>
              <input
                type="number"
                min={1} max={52}
                value={localS}
                onChange={e => setLocalS(Number(e.target.value))}
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="text-xs text-slate-600 block mb-1">재고조정 R (배수)</label>
              <input
                type="number"
                min={0} max={10} step={0.1}
                value={localR}
                onChange={e => setLocalR(Number(e.target.value))}
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          </div>

          {/* Preview */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
            <div className="text-[11px] text-blue-600 font-semibold mb-1">실시간 미리보기</div>
            <div className="flex items-center gap-4">
              <div>
                <div className="text-[10px] text-slate-500">신규 추천수량</div>
                <div className="text-lg font-bold text-blue-700 tabular-nums">
                  {preview?.ad.toLocaleString() ?? '—'}<span className="text-xs font-normal ml-1">개</span>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500">현재 확정발주</div>
                <div className="text-lg font-bold text-emerald-600 tabular-nums">
                  {color.aj.toLocaleString()}<span className="text-xs font-normal ml-1">개</span>
                </div>
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded border border-slate-300 text-xs text-slate-600 hover:bg-slate-50"
            >
              취소
            </button>
            <button
              onClick={handleConfirm}
              className="px-4 py-1.5 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
            >
              적용
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
