'use client'

import { useReorderStore } from '@/store/reorder-store'
import { STRATEGY_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { Strategy } from '@/types/reorder'

interface Props {
  styleId: string
  strategy: Strategy
}

const LEVELS: Strategy[] = [1, 2, 3, 4, 5]

const LEVEL_STYLES: Record<Strategy, string> = {
  1: 'bg-slate-100 text-slate-600 border-slate-300',
  2: 'bg-blue-50 text-blue-600 border-blue-200',
  3: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  4: 'bg-orange-50 text-orange-600 border-orange-200',
  5: 'bg-red-50 text-red-600 border-red-200',
}

const ACTIVE_STYLES: Record<Strategy, string> = {
  1: 'bg-slate-500 text-white border-slate-500',
  2: 'bg-blue-500 text-white border-blue-500',
  3: 'bg-emerald-500 text-white border-emerald-500',
  4: 'bg-orange-500 text-white border-orange-500',
  5: 'bg-red-500 text-white border-red-500',
}

export function StrategySelector({ styleId, strategy }: Props) {
  const setStyleStrategy = useReorderStore(s => s.setStyleStrategy)

  return (
    <div className="flex items-center gap-0.5">
      {LEVELS.map(level => (
        <button
          key={level}
          onClick={() => setStyleStrategy(styleId, level)}
          title={STRATEGY_LABELS[level]}
          className={cn(
            'w-6 h-6 text-[10px] font-bold rounded border transition-all',
            strategy === level ? ACTIVE_STYLES[level] : LEVEL_STYLES[level]
          )}
        >
          {level}
        </button>
      ))}
    </div>
  )
}
