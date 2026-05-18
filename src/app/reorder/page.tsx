'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/reorder/Sidebar'
import { SessionSelector } from '@/components/reorder/SessionSelector'
import { DashboardPage } from '@/components/reorder/pages/DashboardPage'
import { CalcResultsPage } from '@/components/reorder/pages/CalcResultsPage'
import { StyleSearchPage } from '@/components/reorder/pages/StyleSearchPage'
import { DataUploadPage } from '@/components/reorder/pages/DataUploadPage'
import { HistoryPage } from '@/components/reorder/pages/HistoryPage'
import { CarryoverListPage } from '@/components/reorder/pages/CarryoverListPage'
import { MdGroupPage } from '@/components/reorder/pages/MdGroupPage'
import { useReorderStore } from '@/store/reorder-store'
import { getWeekRange } from '@/lib/constants'
import { RefreshCw, LogOut } from 'lucide-react'
import type { PageKey } from '@/components/reorder/Sidebar'

export default function ReorderPage() {
  const [page, setPage] = useState<PageKey>('dashboard')
  const isLoading      = useReorderStore(s => s.isLoading)
  const currentSession = useReorderStore(s => s.currentSession)
  const router         = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar current={page} onChange={setPage} />

      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-3">
            <PageTitle page={page} />
            {currentSession && (
              <span className="text-slate-400 text-xs border-l border-slate-200 pl-3">
                {currentSession.name} · {getWeekRange(currentSession.base_date)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <SessionSelector />
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded text-xs transition"
              title="로그아웃"
            >
              <LogOut className="w-3.5 h-3.5" />
              로그아웃
            </button>
          </div>
        </header>

        {/* Loading overlay */}
        {isLoading && (
          <div className="flex items-center justify-center py-24 text-slate-400 gap-2 flex-1">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-sm">데이터 로딩 중...</span>
          </div>
        )}

        {/* Page content */}
        {!isLoading && (
          <main className="flex-1 flex flex-col min-h-0">
            {page === 'dashboard'  && <DashboardPage onNavigate={setPage} />}
            {page === 'results'    && <CalcResultsPage />}
            {page === 'search'     && <StyleSearchPage />}
            {page === 'upload'     && <DataUploadPage onNavigate={setPage} />}
            {page === 'history'    && <HistoryPage />}
            {page === 'carryover'  && <CarryoverListPage />}
            {page === 'md_group'   && <MdGroupPage />}
          </main>
        )}
      </div>
    </div>
  )
}

function PageTitle({ page }: { page: PageKey }) {
  const labels: Record<PageKey, string> = {
    dashboard:  '대시보드',
    results:    '계산 결과',
    search:     '스타일 검색',
    upload:     '데이터 업로드',
    history:    '리오더 이력',
    carryover:  '캐리오버 리스트 관리',
    md_group:   'MD별 모아보기',
  }
  return <span className="text-sm font-semibold text-slate-800">{labels[page]}</span>
}
