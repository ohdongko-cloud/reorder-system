'use client'

import { useState, useRef } from 'react'
import { useReorderStore } from '@/store/reorder-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Upload, FileSpreadsheet, X } from 'lucide-react'
import { toast } from 'sonner'
import { parseReorderExcel } from '@/lib/excel-parser'

interface Props {
  onClose: () => void
}

export function ExcelUpload({ onClose }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState(`리오더 점검 ${new Date().toISOString().slice(0, 10)}`)
  const [baseDate, setBaseDate] = useState(new Date().toISOString().slice(0, 10))
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const setStyles = useReorderStore(s => s.setStyles)
  const setCurrentSession = useReorderStore(s => s.setCurrentSession)
  const setSessions = useReorderStore(s => s.setSessions)
  const sessions = useReorderStore(s => s.sessions)

  function handleFile(f: File) {
    if (!f.name.match(/\.(xlsx|xls)$/i)) {
      toast.error('xlsx 또는 xls 파일만 업로드 가능합니다.')
      return
    }
    setFile(f)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return

    setUploading(true)
    try {
      // 브라우저에서 파싱 — 원본 파일을 서버로 전송하지 않아 크기 제한 없음
      const buffer = await file.arrayBuffer()
      const { styles, errors, sheetName } = await parseReorderExcel(buffer)

      if (styles.length === 0) {
        toast.error(errors[0] ?? '파싱 실패 — BI 시트가 없거나 MI 스타일 데이터를 찾을 수 없습니다.')
        if (errors.length > 1) errors.slice(1).forEach(w => toast.warning(w))
        return
      }

      // 파싱된 JSON만 서버로 전송
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, base_date: baseDate, sheet_name: sheetName, styles }),
      })

      type UploadResponse = {
        session_id?: string; session_name?: string; style_count?: number
        sheet_used?: string; warnings?: string[]; error?: string
      }
      let data: UploadResponse
      try {
        data = await res.json()
      } catch {
        toast.error(`서버 응답 오류 (HTTP ${res.status})`)
        return
      }

      if (!res.ok) {
        toast.error(data.error ?? '업로드 실패')
        return
      }

      toast.success(`${data.style_count}개 스타일 업로드 완료 (${data.sheet_used})`)
      if (errors.length) errors.forEach(w => toast.warning(w))

      const sessionId   = data.session_id!
      const sessionName = data.session_name!
      const stylesRes = await fetch(`/api/sessions/${sessionId}/styles`)
      const stylesData = await stylesRes.json()
      setStyles(stylesData)
      setCurrentSession({ id: sessionId, name: sessionName, base_date: baseDate, created_by: null, created_at: new Date().toISOString() })
      setSessions([{ id: sessionId, name: sessionName, base_date: baseDate, created_by: null, created_at: new Date().toISOString() }, ...sessions])
      onClose()
    } catch (err) {
      toast.error(`오류: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Drop zone */}
      <div
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
          dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-slate-400',
          file && 'border-emerald-400 bg-emerald-50'
        )}
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault()
          setDragOver(false)
          const f = e.dataTransfer.files[0]
          if (f) handleFile(f)
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }}
        />
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <FileSpreadsheet className="w-8 h-8 text-emerald-600" />
            <div className="text-left">
              <div className="text-sm font-semibold text-emerald-700">{file.name}</div>
              <div className="text-xs text-slate-500">{(file.size / 1024).toFixed(0)} KB</div>
            </div>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setFile(null) }}
              className="ml-2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <div className="text-sm text-slate-600">클릭하거나 파일을 드래그하세요</div>
            <div className="text-xs text-slate-400 mt-1">리오더점검_xxxxxx.xlsx (BI 시트 포함)</div>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="session-name" className="text-xs">세션 이름</Label>
          <Input
            id="session-name"
            value={name}
            onChange={e => setName(e.target.value)}
            className="text-sm h-8"
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="base-date" className="text-xs">기준일</Label>
          <Input
            id="base-date"
            type="date"
            value={baseDate}
            onChange={e => setBaseDate(e.target.value)}
            className="text-sm h-8"
            required
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>취소</Button>
        <Button type="submit" size="sm" disabled={!file || uploading}>
          {uploading ? '분석 중...' : '업로드'}
        </Button>
      </div>
    </form>
  )
}
