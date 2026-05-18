'use client'

import { useState, useRef } from 'react'
import { useReorderStore } from '@/store/reorder-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Upload, FileSpreadsheet, X, CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { parseReorderExcel } from '@/lib/excel-parser'

interface Props {
  onClose: () => void
}

type UploadStep = 'idle' | 'reading' | 'parsing' | 'uploading' | 'loading' | 'done'

const STEPS: { key: UploadStep; label: string; pct: number }[] = [
  { key: 'reading',  label: '파일 읽는 중...',          pct: 10 },
  { key: 'parsing',  label: '엑셀 데이터 분석 중...',    pct: 55 },
  { key: 'uploading',label: '서버에 저장 중...',         pct: 80 },
  { key: 'loading',  label: '결과 불러오는 중...',       pct: 95 },
  { key: 'done',     label: '완료!',                    pct: 100 },
]

export function ExcelUpload({ onClose }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState(`리오더 점검 ${new Date().toISOString().slice(0, 10)}`)
  const [baseDate, setBaseDate] = useState(new Date().toISOString().slice(0, 10))
  const [step, setStep] = useState<UploadStep>('idle')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const setStyles = useReorderStore(s => s.setStyles)
  const setPrevYearCandidates = useReorderStore(s => s.setPrevYearCandidates)
  const applyStyleNames = useReorderStore(s => s.applyStyleNames)
  const setCurrentSession = useReorderStore(s => s.setCurrentSession)
  const setSessions = useReorderStore(s => s.setSessions)
  const sessions = useReorderStore(s => s.sessions)

  const uploading = step !== 'idle'
  const currentPct = STEPS.find(s => s.key === step)?.pct ?? 0

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

    try {
      // Step 1: Read file
      setStep('reading')
      const buffer = await file.arrayBuffer()

      // Step 2: Parse Excel in browser (no server size limit)
      setStep('parsing')
      // yield to React so the label actually renders before synchronous parse
      await new Promise(r => setTimeout(r, 50))
      const { styles, errors, sheetName, prevYearCandidates, styleNameMap } = await parseReorderExcel(buffer)

      if (styles.length === 0) {
        toast.error(errors[0] ?? '파싱 실패 — BI 시트가 없거나 MI 스타일 데이터를 찾을 수 없습니다.')
        if (errors.length > 1) errors.slice(1).forEach(w => toast.warning(w))
        setStep('idle')
        return
      }

      // Step 3: Upload parsed JSON
      setStep('uploading')
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
        setStep('idle')
        return
      }

      if (!res.ok) {
        toast.error(data.error ?? '업로드 실패')
        setStep('idle')
        return
      }

      // Step 4: Load styles
      setStep('loading')
      const sessionId   = data.session_id!
      const sessionName = data.session_name!
      const stylesRes = await fetch(`/api/sessions/${sessionId}/styles`)
      const stylesData = await stylesRes.json()

      setStep('done')
      await new Promise(r => setTimeout(r, 400))

      toast.success(`${data.style_count}개 스타일 업로드 완료 (${data.sheet_used})`)
      if (errors.length) errors.forEach(w => toast.warning(w))

      setStyles(stylesData)
      applyStyleNames(styleNameMap)
      setPrevYearCandidates(prevYearCandidates)
      setCurrentSession({ id: sessionId, name: sessionName, base_date: baseDate, created_by: null, created_at: new Date().toISOString() })
      setSessions([{ id: sessionId, name: sessionName, base_date: baseDate, created_by: null, created_at: new Date().toISOString() }, ...sessions])
      onClose()
    } catch (err) {
      toast.error(`오류: ${err instanceof Error ? err.message : String(err)}`)
      setStep('idle')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Drop zone */}
      <div
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
          dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-slate-400',
          file && 'border-emerald-400 bg-emerald-50',
          uploading && 'pointer-events-none opacity-60'
        )}
        onClick={() => !uploading && fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); if (!uploading) setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault()
          setDragOver(false)
          if (uploading) return
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
            {!uploading && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setFile(null) }}
                className="ml-2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <>
            <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <div className="text-sm text-slate-600">클릭하거나 파일을 드래그하세요</div>
            <div className="text-xs text-slate-400 mt-1">리오더점검_xxxxxx.xlsx (BI 시트 포함)</div>
          </>
        )}
      </div>

      {/* Progress bar — shown during upload */}
      {uploading && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              {step === 'done'
                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                : <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
              }
              {STEPS.find(s => s.key === step)?.label}
            </span>
            <span className="font-medium tabular-nums">{currentPct}%</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                step === 'done' ? 'bg-emerald-500' : 'bg-blue-500'
              )}
              style={{ width: `${currentPct}%` }}
            />
          </div>
          {step === 'parsing' && (
            <p className="text-[11px] text-slate-400 text-center">
              파일 크기에 따라 5~15초 소요될 수 있습니다
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="session-name" className="text-xs">세션 이름</Label>
          <Input
            id="session-name"
            value={name}
            onChange={e => setName(e.target.value)}
            className="text-sm h-8"
            required
            disabled={uploading}
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
            disabled={uploading}
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={uploading}>취소</Button>
        <Button type="submit" size="sm" disabled={!file || uploading}>
          {uploading ? '처리 중...' : '업로드'}
        </Button>
      </div>
    </form>
  )
}
