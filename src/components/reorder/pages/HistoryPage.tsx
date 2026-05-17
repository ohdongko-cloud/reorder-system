'use client'

import { useState } from 'react'
import { useReorderStore } from '@/store/reorder-store'
import { MessageSquarePlus, X, Mail } from 'lucide-react'

export function HistoryPage() {
  const sessions = useReorderStore(s => s.sessions)
  const [showModal, setShowModal] = useState(false)

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-800">리오더 이력</h1>
        <p className="text-sm text-slate-500 mt-0.5">저장된 리오더 세션 목록입니다.</p>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm bg-white border border-slate-200 rounded-lg">
          저장된 세션이 없습니다. 엑셀 파일을 업로드하면 세션이 생성됩니다.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-2.5 text-left font-semibold text-slate-600">세션명</th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-600">기준일</th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-600">스타일 수</th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-600">생성일시</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s, i) => (
                <tr key={s.id} className={`border-b border-slate-100 ${i % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{s.name}</td>
                  <td className="px-4 py-2.5 text-slate-500 tabular-nums">{s.base_date}</td>
                  <td className="px-4 py-2.5 text-slate-500">{s.style_count ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-400 tabular-nums">{s.created_at.slice(0, 16).replace('T', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 개선 요청하기 버튼 */}
      <div className="pt-2">
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition shadow-sm"
        >
          <MessageSquarePlus className="w-4 h-4" />
          개선 요청하기
        </button>
      </div>

      {/* 개선 요청 모달 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />

          {/* Modal card */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            {/* Close */}
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Icon */}
            <div className="flex items-center justify-center w-12 h-12 bg-blue-50 rounded-xl mb-4">
              <MessageSquarePlus className="w-6 h-6 text-blue-600" />
            </div>

            <h2 className="text-base font-bold text-slate-800 mb-1">개선 요청 · 문의</h2>
            <p className="text-sm text-slate-500 mb-5 leading-relaxed">
              시스템 기능 개선 요청이나 오류 신고는 아래 담당자에게 이메일로 문의해 주세요.
            </p>

            {/* Contact card */}
            <a
              href="mailto:OH_DONGHA01@ELAND.CO.KR?subject=[MI 리오더] 개선 요청"
              className="flex items-center gap-3 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-xl px-4 py-3 transition group"
            >
              <div className="flex items-center justify-center w-9 h-9 bg-blue-600 rounded-lg shrink-0 group-hover:bg-blue-700 transition">
                <Mail className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 mb-0.5">담당자 이메일</p>
                <p className="text-sm font-semibold text-slate-800 font-mono truncate">
                  OH_DONGHA01@ELAND.CO.KR
                </p>
              </div>
            </a>

            <p className="text-[11px] text-slate-400 mt-4 text-center">
              클릭하면 이메일 앱이 열립니다
            </p>

            <button
              onClick={() => setShowModal(false)}
              className="mt-4 w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
