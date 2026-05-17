'use client'

import { useEffect } from 'react'
import { useReorderStore } from '@/store/reorder-store'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import type { ReorderSession } from '@/types/reorder'

export function SessionSelector() {
  const sessions = useReorderStore(s => s.sessions)
  const currentSession = useReorderStore(s => s.currentSession)
  const setSessions = useReorderStore(s => s.setSessions)
  const setCurrentSession = useReorderStore(s => s.setCurrentSession)
  const setStyles = useReorderStore(s => s.setStyles)
  const setLoading = useReorderStore(s => s.setLoading)

  useEffect(() => {
    fetch('/api/sessions')
      .then(r => r.json())
      .then((data: unknown) => {
        if (!Array.isArray(data)) return  // Supabase 미설정 시 에러 객체 무시
        setSessions(data as ReorderSession[])
        const sessions = data as ReorderSession[]
        if (sessions.length > 0 && !currentSession) {
          loadSession(sessions[0])
        }
      })
      .catch(() => {})  // Supabase 미설정 환경에서는 조용히 무시
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadSession(session: ReorderSession) {
    setLoading(true)
    setCurrentSession(session)
    try {
      const res = await fetch(`/api/sessions/${session.id}/styles`)
      const data = await res.json()
      setStyles(data)
    } catch {
      toast.error('스타일 데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  if (sessions.length === 0) return null

  return (
    <Select
      value={currentSession?.id ?? ''}
      onValueChange={id => {
        const s = sessions.find(s => s.id === id)
        if (s) loadSession(s)
      }}
    >
      <SelectTrigger className="h-8 text-xs w-56">
        <SelectValue placeholder="세션 선택" />
      </SelectTrigger>
      <SelectContent>
        {sessions.map(s => (
          <SelectItem key={s.id} value={s.id} className="text-xs">
            {s.name}
            <span className="text-slate-400 ml-1">({s.base_date})</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
