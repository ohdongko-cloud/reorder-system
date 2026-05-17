'use client'

import { ExcelUpload } from '../ExcelUpload'
import type { PageKey } from '../Sidebar'
import { cn } from '@/lib/utils'

interface Props {
  onNavigate: (page: PageKey) => void
}

// ─── Mini spreadsheet component ──────────────────────────────────────────────
interface Cell {
  label: string
  highlight?: 'blue' | 'emerald' | 'amber' | 'rose' | 'slate' | 'header' | 'skip'
  span?: number
  note?: string
}

function SheetGuide({
  sheetName,
  accent,
  description,
  dataStart,
  columns,
  rows,
  notes,
}: {
  sheetName: string
  accent: string
  description: string
  dataStart: string
  columns: Cell[]
  rows: Cell[][]
  notes: string[]
}) {
  const accentBg: Record<string, string> = {
    blue:    'bg-blue-600',
    emerald: 'bg-emerald-600',
    amber:   'bg-amber-500',
  }
  const accentBorder: Record<string, string> = {
    blue:    'border-blue-200',
    emerald: 'border-emerald-200',
    amber:   'border-amber-200',
  }
  const accentText: Record<string, string> = {
    blue:    'text-blue-700',
    emerald: 'text-emerald-700',
    amber:   'text-amber-700',
  }

  return (
    <div className={cn('border rounded-xl overflow-hidden shadow-sm', accentBorder[accent])}>
      {/* Sheet tab header */}
      <div className={cn('flex items-center gap-2 px-4 py-2.5', accentBg[accent])}>
        <span className="text-white font-bold text-sm font-mono">{sheetName}</span>
        <span className="text-white/70 text-xs">시트</span>
        <span className="ml-auto text-white/80 text-xs">{description}</span>
      </div>

      {/* Spreadsheet preview */}
      <div className="overflow-x-auto bg-white">
        <table className="text-[11px] border-collapse w-full min-w-max">
          {/* Column headers (A, B, C…) */}
          <thead>
            <tr>
              <th className="w-8 bg-slate-100 border border-slate-300 text-slate-400 font-normal px-1 py-0.5 text-center">#</th>
              {columns.map((col, i) => (
                <th
                  key={i}
                  className="bg-slate-100 border border-slate-300 text-slate-500 font-semibold px-2 py-0.5 text-center min-w-[72px]"
                  colSpan={col.span ?? 1}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                <td className="bg-slate-50 border border-slate-200 text-slate-400 text-center px-1 py-0.5 font-mono">
                  {ri + 1}
                </td>
                {row.map((cell, ci) => {
                  const cls =
                    cell.highlight === 'blue'   ? 'bg-blue-50 text-blue-800 font-semibold border-blue-200' :
                    cell.highlight === 'emerald'? 'bg-emerald-50 text-emerald-800 font-semibold border-emerald-200' :
                    cell.highlight === 'amber'  ? 'bg-amber-50 text-amber-800 font-semibold border-amber-200' :
                    cell.highlight === 'rose'   ? 'bg-rose-50 text-rose-700 border-rose-200' :
                    cell.highlight === 'header' ? 'bg-slate-200 text-slate-600 font-semibold border-slate-300' :
                    cell.highlight === 'skip'   ? 'bg-slate-50 text-slate-300 border-slate-200 italic' :
                    'bg-white text-slate-500 border-slate-200'
                  return (
                    <td
                      key={ci}
                      className={cn('border px-2 py-1 text-center whitespace-nowrap', cls)}
                      colSpan={cell.span ?? 1}
                      title={cell.note}
                    >
                      {cell.label}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Notes */}
      <div className="bg-slate-50 border-t border-slate-200 px-4 py-3 space-y-1">
        <p className="text-[11px] font-semibold text-slate-500 mb-1.5">데이터 시작 위치: <span className={cn('font-bold', accentText[accent])}>{dataStart}</span></p>
        {notes.map((n, i) => (
          <p key={i} className="text-[11px] text-slate-500 flex gap-1.5">
            <span className={cn('shrink-0', accentText[accent])}>•</span>
            <span dangerouslySetInnerHTML={{ __html: n }} />
          </p>
        ))}
      </div>
    </div>
  )
}

// ─── Legend ──────────────────────────────────────────────────────────────────
function Legend() {
  const items = [
    { cls: 'bg-blue-50 border-blue-200',    label: '주요 데이터 열 (파서가 읽음)' },
    { cls: 'bg-slate-200 border-slate-300', label: '헤더 / 타이틀 행' },
    { cls: 'bg-slate-50 border-slate-200 text-slate-300', label: '건너뜀 (빈 행 또는 소계)' },
  ]
  return (
    <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
      {items.map(({ cls, label }) => (
        <div key={label} className="flex items-center gap-1.5">
          <span className={cn('w-4 h-4 rounded border inline-block', cls)} />
          {label}
        </div>
      ))}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function DataUploadPage({ onNavigate }: Props) {
  return (
    <div className="p-6 max-w-5xl space-y-8">
      {/* ── Upload section ──────────────────────────────────────────────── */}
      <div>
        <h1 className="text-lg font-bold text-slate-800">데이터 업로드</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          BI, 분배확정, BI_요일판매 시트가 포함된 엑셀 파일을 업로드하세요.
          업로드 시 모든 스타일에 대해 리오더 추천 수량이 자동 계산됩니다.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-lg">
        <ExcelUpload onClose={() => onNavigate('results')} />
      </div>

      {/* ── Sheet guide ─────────────────────────────────────────────────── */}
      <div className="space-y-6">
        <div>
          <h2 className="text-base font-bold text-slate-800">엑셀 파일 형식 가이드</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            파일에 아래 3개 시트가 정확한 컬럼 위치로 포함되어 있어야 합니다.
          </p>
        </div>

        <Legend />

        {/* ── BI 시트 ─────────────────────────────────────────────────── */}
        <SheetGuide
          sheetName="BI"
          accent="blue"
          description="스타일 · 컬러별 발주 / 입고 / 재고 데이터"
          dataStart="9행(row 9)부터 데이터, 1행 헤더, 2행 조회기간"
          columns={[
            { label: 'A' }, { label: 'B' },
            { label: 'C  스타일코드', highlight: 'blue' },
            { label: 'D' },
            { label: 'E  결판가', highlight: 'blue' },
            { label: 'F' },
            { label: 'G  최초입고일', highlight: 'blue' },
            { label: 'H~L' },
            { label: 'M  컬러(Now)', highlight: 'blue' },
            { label: 'N  발주량(k)', highlight: 'blue' },
            { label: 'O~Q' },
            { label: 'R  누적입고(l)', highlight: 'blue' },
            { label: 'S~AM' },
            { label: 'AN  판매재고', highlight: 'blue' },
          ]}
          rows={[
            [
              { label: '(헤더)', highlight: 'header', span: 14 },
            ],
            [
              { label: '' },
              { label: '2026-04-20 - 2026-04-26  ← 조회기간 (B2)', highlight: 'blue', span: 13 },
            ],
            [
              { label: '(메타 / 헤더 행 3~8)', highlight: 'skip', span: 14 },
            ],
            [
              { label: 'MIA0AG20SS' },
              { label: '...' },
              { label: '2026-01-15' },
              { label: '' },
              { label: 'Beige', highlight: 'blue' },
              { label: '3,000', highlight: 'blue' },
              { label: '' },
              { label: '' },
              { label: '200', highlight: 'blue' },
              { label: '' },
              { label: '' },
              { label: '' },
              { label: '20', highlight: 'blue' },
              { label: '14', highlight: 'blue' },
            ],
            [
              { label: '' },
              { label: '...' },
              { label: '' },
              { label: '' },
              { label: 'Grey', highlight: 'blue' },
              { label: '3,000', highlight: 'blue' },
              { label: '' },
              { label: '' },
              { label: '100', highlight: 'blue' },
              { label: '' },
              { label: '' },
              { label: '' },
              { label: '10', highlight: 'blue' },
              { label: '8', highlight: 'blue' },
            ],
            [
              { label: '' },
              { label: '...' },
              { label: '' },
              { label: '' },
              { label: '결과', highlight: 'skip' },
              { label: '(소계 → 건너뜀)', highlight: 'skip', span: 9 },
            ],
          ]}
          notes={[
            '<b>C열</b>: MI로 시작하는 스타일코드 (예: MIA0AG20SS)',
            '<b>E열</b>: 결판가 — 주판량 환산에 사용',
            '<b>G열</b>: 최초입고일 — PLC 단계 계산 기준',
            '<b>M열</b>: 컬러명 — <b>결과</b> 또는 <b>(NA)</b>로 시작하는 행은 자동으로 건너뜀',
            '<b>N열</b>: 발주량(k)',
            '<b>R열</b>: 누적입고량(l)',
            '<b>AN열(40번)</b>: 판매재고량 — m = l − AN 공식으로 누판량 계산',
            '2행 B열: 조회기간 문자열에서 기준일(마지막 날짜) 자동 추출',
          ]}
        />

        {/* ── 분배확정 시트 ────────────────────────────────────────────── */}
        <SheetGuide
          sheetName="분배확정"
          accent="emerald"
          description="스타일별 매장 배분 수량"
          dataStart="2행(row 2)부터 데이터, 1행 헤더"
          columns={[
            { label: 'A' }, { label: 'B' }, { label: 'C' },
            { label: 'D  스타일코드', highlight: 'emerald' },
            { label: 'E  매장수', highlight: 'emerald' },
            { label: 'F  분배량(aj)', highlight: 'emerald' },
          ]}
          rows={[
            [
              { label: '(헤더)', highlight: 'header', span: 6 },
            ],
            [
              { label: '...' },
              { label: '...' },
              { label: '...' },
              { label: 'MIA0AG20SS', highlight: 'emerald' },
              { label: '35', highlight: 'emerald' },
              { label: '210', highlight: 'emerald' },
            ],
            [
              { label: '...' },
              { label: '...' },
              { label: '...' },
              { label: 'MIA0AG20SS', highlight: 'emerald' },
              { label: '20', highlight: 'emerald' },
              { label: '140', highlight: 'emerald' },
            ],
            [
              { label: '...' },
              { label: '...' },
              { label: '...' },
              { label: 'MIWCKG311T', highlight: 'emerald' },
              { label: '42', highlight: 'emerald' },
              { label: '300', highlight: 'emerald' },
            ],
          ]}
          notes={[
            '<b>D열</b>: MI로 시작하는 스타일코드',
            '<b>E열</b>: 매장수 — 동일 스타일 여러 행이 있으면 최댓값 사용',
            '<b>F열</b>: 분배량 — 동일 스타일 여러 행은 합산 후 컬러별 입고 비율로 배분',
          ]}
        />

        {/* ── BI_요일판매 시트 ─────────────────────────────────────────── */}
        <SheetGuide
          sheetName="BI_요일판매"
          accent="amber"
          description="스타일별 일별 판매금액 (28일)"
          dataStart="8행(row 8)부터 데이터, 7행까지 헤더/집계"
          columns={[
            { label: 'A' }, { label: 'B' },
            { label: 'C  스타일코드', highlight: 'amber' },
            { label: 'D  1일차', highlight: 'amber' },
            { label: 'E  2일차', highlight: 'amber' },
            { label: '...', highlight: 'amber' },
            { label: 'AE  28일차', highlight: 'amber' },
          ]}
          rows={[
            [
              { label: '(메타 / 헤더 행 1~6)', highlight: 'skip', span: 7 },
            ],
            [
              { label: '(집계 행 7)', highlight: 'skip', span: 7 },
            ],
            [
              { label: '...' },
              { label: '...' },
              { label: 'MIA0AG20SS', highlight: 'amber' },
              { label: '45,000', highlight: 'amber' },
              { label: '38,000', highlight: 'amber' },
              { label: '...', highlight: 'amber' },
              { label: '52,000', highlight: 'amber' },
            ],
            [
              { label: '...' },
              { label: '...' },
              { label: 'MIWCKG311T', highlight: 'amber' },
              { label: '120,000', highlight: 'amber' },
              { label: '98,000', highlight: 'amber' },
              { label: '...', highlight: 'amber' },
              { label: '135,000', highlight: 'amber' },
            ],
          ]}
          notes={[
            '<b>C열</b>: MI로 시작하는 스타일코드',
            '<b>D열~</b>: 일별 판매금액 (28일치) — 모두 합산 후 <b>÷ 4</b>하여 주간 판매금액 산출',
            '주간 판매금액 ÷ 결판가 = 주판량(n), 이후 컬러별 입고 비율로 배분',
            '8행 미만은 모두 건너뜀 (헤더/집계 행)',
          ]}
        />

        {/* ── Summary note ─────────────────────────────────────────────── */}
        <div className="bg-slate-800 text-slate-300 rounded-xl p-5 text-xs space-y-2">
          <p className="font-bold text-white text-sm mb-3">파싱 흐름 요약</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white/5 rounded-lg p-3 space-y-1">
              <p className="font-semibold text-blue-300">① BI 시트</p>
              <p>스타일 / 컬러별 k, l, m 수집</p>
              <p>결판가 · 최초입고일 · 기준일 추출</p>
            </div>
            <div className="bg-white/5 rounded-lg p-3 space-y-1">
              <p className="font-semibold text-emerald-300">② 분배확정 시트</p>
              <p>스타일별 매장수(최대) · 분배량(합) 수집</p>
              <p>컬러 입고 비율로 aj 배분</p>
            </div>
            <div className="bg-white/5 rounded-lg p-3 space-y-1">
              <p className="font-semibold text-amber-300">③ BI_요일판매 시트</p>
              <p>28일 판매금액 합산 → 주간 환산</p>
              <p>÷ 결판가 → 주판량(n) 컬러별 배분</p>
            </div>
          </div>
          <p className="text-slate-400 pt-1">
            * BI 시트가 없으면 <span className="font-mono text-slate-300">리오더예상_CHECK</span> 시트(레거시)로 폴백합니다.
          </p>
        </div>
      </div>
    </div>
  )
}
