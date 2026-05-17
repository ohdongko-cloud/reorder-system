'use client'

import { useReorderStore } from '@/store/reorder-store'
import { MIN_RECOMMEND_QTY } from '@/lib/constants'
import type { PageKey } from '../Sidebar'
import { AlertTriangle, TrendingUp, Package, CheckCircle } from 'lucide-react'

interface Props {
  onNavigate: (page: PageKey) => void
}

export function DashboardPage({ onNavigate }: Props) {
  const sessions = useReorderStore(s => s.sessions)
  const currentSession = useReorderStore(s => s.currentSession)
  const styles = useReorderStore(s => s.styles)
  const getFilteredStyles = useReorderStore(s => s.getFilteredStyles)

  const filtered = getFilteredStyles()
  const totalStyles = styles.length
  const filteredCount = filtered.length

  let totalOld = 0, totalNew = 0, totalAj = 0, alertCount = 0
  for (const style of filtered) {
    for (const c of style.colors) {
      totalOld += c.calcOld ?? 0
      totalNew += c.calcNew ?? 0
      totalAj  += c.aj
      if (c.calcNew && c.aj > 0) {
        const r = c.aj / c.calcNew
        if (r < 0.6 || r > 1.5) alertCount++
      }
    }
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-slate-800">대시보드</h1>
        {currentSession ? (
          <p className="text-sm text-slate-500 mt-0.5">
            {currentSession.name} · {currentSession.base_date}
          </p>
        ) : (
          <p className="text-sm text-slate-400 mt-0.5">세션을 선택하거나 엑셀 파일을 업로드하세요</p>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<Package className="w-5 h-5 text-blue-500" />}
          label="추천 대상 스타일"
          value={filteredCount}
          unit="개"
          sub={`전체 ${totalStyles}개 중 300장+ 조건`}
          color="blue"
        />
        <KpiCard
          icon={<TrendingUp className="w-5 h-5 text-indigo-500" />}
          label="신규 로직 총 추천량"
          value={totalNew.toLocaleString()}
          unit="장"
          sub={`기존 대비 ${totalOld > 0 ? ((totalNew - totalOld) / totalOld * 100).toFixed(1) + '%' : '—'}`}
          color="indigo"
        />
        <KpiCard
          icon={<CheckCircle className="w-5 h-5 text-emerald-500" />}
          label="확정발주 합계"
          value={totalAj.toLocaleString()}
          unit="장"
          sub={totalNew > 0 ? `추천 대비 ${(totalAj / totalNew * 100).toFixed(0)}%` : '—'}
          color="emerald"
        />
        <KpiCard
          icon={<AlertTriangle className="w-5 h-5 text-red-500" />}
          label="위험 컬러"
          value={alertCount}
          unit="개"
          sub="발주 부족 또는 과잉"
          color="red"
          urgent={alertCount > 0}
        />
      </div>

      {/* Recent sessions */}
      {sessions.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">최근 세션</h2>
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">세션명</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">기준일</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">스타일 수</th>
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 5).map((s, i) => (
                  <tr key={s.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="px-4 py-2 font-medium text-slate-800">{s.name}</td>
                    <td className="px-4 py-2 text-slate-500">{s.base_date}</td>
                    <td className="px-4 py-2 text-slate-500">{s.style_count ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Alerts */}
      {totalStyles === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-semibold text-amber-800">데이터 없음</div>
            <div className="text-xs text-amber-700 mt-0.5">
              엑셀 파일을 업로드하거나 왼쪽 메뉴에서 세션을 로드하세요.
            </div>
            <button
              onClick={() => onNavigate('upload')}
              className="mt-2 text-xs text-amber-800 underline hover:text-amber-900"
            >
              데이터 업로드 →
            </button>
          </div>
        </div>
      )}

      {filteredCount > 0 && (
        <div className="flex gap-3">
          <button
            onClick={() => onNavigate('results')}
            className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700"
          >
            계산 결과 보기 →
          </button>
        </div>
      )}
    </div>
  )
}

function KpiCard({
  icon, label, value, unit, sub, color, urgent
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  unit: string
  sub: string
  color: string
  urgent?: boolean
}) {
  return (
    <div className={`bg-white border rounded-lg p-4 ${urgent ? 'border-red-200 bg-red-50/30' : 'border-slate-200'}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <div className="text-2xl font-bold text-slate-800 tabular-nums leading-tight">
        {value}<span className="text-sm font-normal text-slate-500 ml-1">{unit}</span>
      </div>
      <div className="text-[11px] text-slate-400 mt-1">{sub}</div>
    </div>
  )
}
