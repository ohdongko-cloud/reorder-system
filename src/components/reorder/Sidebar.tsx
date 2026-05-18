'use client'

import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  TableProperties,
  Search,
  Upload,
  History,
  BookMarked,
} from 'lucide-react'

export type PageKey = 'dashboard' | 'results' | 'search' | 'upload' | 'history' | 'carryover'

interface Props {
  current: PageKey
  onChange: (page: PageKey) => void
}

const NAV_ITEMS: { key: PageKey; label: string; icon: React.ElementType; indent?: boolean }[] = [
  { key: 'dashboard',  label: '대시보드',         icon: LayoutDashboard },
  { key: 'results',    label: '계산 결과',         icon: TableProperties },
  { key: 'search',     label: '스타일 검색',       icon: Search },
  { key: 'upload',     label: '데이터 업로드',     icon: Upload },
  { key: 'history',    label: '리오더 이력',       icon: History },
  { key: 'carryover',  label: '캐리오버 리스트 관리', icon: BookMarked, indent: true },
]

export function Sidebar({ current, onChange }: Props) {
  return (
    <aside className="w-52 bg-slate-900 text-white flex flex-col shrink-0 min-h-screen">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-slate-700">
        <div className="text-sm font-bold tracking-tight text-white">의류CU 리오더</div>
        <div className="text-[10px] text-slate-400 mt-0.5">Reorder Automation</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2">
        {NAV_ITEMS.map(({ key, label, icon: Icon, indent }) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={cn(
              'w-full flex items-center gap-3 text-sm text-left transition-colors',
              indent ? 'pl-8 pr-4 py-2' : 'px-4 py-2.5',
              current === key
                ? 'bg-slate-700 text-white font-medium'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-700 text-[10px] text-slate-500">
        v1.0 · MI Brand
      </div>
    </aside>
  )
}
