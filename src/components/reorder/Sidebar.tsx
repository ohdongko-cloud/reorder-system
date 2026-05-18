'use client'

import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Upload,
  TableProperties,
  Search,
  Users,
  History,
  BookMarked,
} from 'lucide-react'

export type PageKey = 'dashboard' | 'results' | 'search' | 'upload' | 'history' | 'carryover' | 'md_group'

interface Props {
  current: PageKey
  onChange: (page: PageKey) => void
}

// HTML 레퍼런스 기준 메뉴 순서
const NAV_ITEMS: { key: PageKey; label: string; icon: React.ElementType; indent?: boolean }[] = [
  { key: 'dashboard', label: '대시보드',         icon: LayoutDashboard },
  { key: 'upload',    label: '데이터 업로드',     icon: Upload },
  { key: 'results',   label: '계산 결과',         icon: TableProperties },
  { key: 'search',    label: '스타일 집중 검색',  icon: Search },
  { key: 'md_group',  label: 'MD별 모아보기',     icon: Users },
  { key: 'history',   label: '리오더 이력',       icon: History },
  { key: 'carryover', label: '캐리오버 리스트 관리', icon: BookMarked, indent: true },
]

export function Sidebar({ current, onChange }: Props) {
  return (
    <aside className="w-52 flex flex-col shrink-0 min-h-screen" style={{ background: '#0f172a', color: '#fff' }}>
      {/* Logo */}
      <div className="px-4 py-[18px] pb-[14px]" style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-[30px] h-[30px] rounded-[7px] flex items-center justify-center text-white font-extrabold text-[13px]"
            style={{ background: 'rgba(255,255,255,.1)' }}>
            E
          </div>
          <div>
            <div className="text-[13px] font-bold" style={{ color: '#f1f5f9' }}>의류CU 리오더</div>
            <div className="text-[10px]" style={{ color: '#475569' }}>v0.3 · 이랜드 내부용</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2.5 px-2 flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ key, label, icon: Icon, indent }) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={cn(
              'w-full flex items-center gap-2.5 text-[12.5px] font-[500] text-left rounded-[7px] transition-all',
              indent ? 'pl-8 pr-3 py-2' : 'px-2.5 py-[9px]',
              current === key
                ? 'font-[600]'
                : ''
            )}
            style={{
              background: current === key ? 'rgba(255,255,255,.1)' : 'transparent',
              color: current === key ? '#f8fafc' : '#94a3b8',
              border: 'none',
              fontFamily: 'inherit',
            }}
            onMouseEnter={e => {
              if (current !== key) {
                e.currentTarget.style.background = 'rgba(255,255,255,.06)'
                e.currentTarget.style.color = '#e2e8f0'
              }
            }}
            onMouseLeave={e => {
              if (current !== key) {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = '#94a3b8'
              }
            }}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span>{label}</span>
            {/* 계산 결과 뱃지 (임시 고정) */}
            {key === 'results' && (
              <span className="ml-auto rounded-full px-1.5 text-[10px] font-bold"
                style={{ background: '#2563eb', color: '#fff', padding: '1px 7px' }}>
                ●
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* 유저 프로필 (HTML 레퍼런스 기준) */}
      <div className="px-3.5 py-3 flex items-center gap-2.5" style={{ borderTop: '1px solid rgba(255,255,255,.06)' }}>
        <div className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-white font-bold text-[13px] shrink-0"
          style={{ background: '#2563eb' }}>
          M
        </div>
        <div className="min-w-0">
          <div className="text-[12px] font-semibold truncate" style={{ color: '#f1f5f9' }}>MD 담당자</div>
          <div className="text-[10px] truncate" style={{ color: '#475569' }}>md@mi-brand.com</div>
        </div>
      </div>
    </aside>
  )
}
