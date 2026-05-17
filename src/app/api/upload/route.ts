import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'
import { parseReorderExcel } from '@/lib/excel-parser'

// ── Simple per-IP rate limiter (10 uploads / minute) ────────────────────────
const rl = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rl.get(ip)
  if (!entry || now > entry.resetAt) {
    rl.set(ip, { count: 1, resetAt: now + 60_000 })
    return true
  }
  if (entry.count >= 10) return false
  entry.count++
  return true
}

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

export async function POST(req: NextRequest) {
  // Rate limit
  if (!checkRateLimit(getIp(req))) {
    return NextResponse.json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.' }, { status: 429 })
  }

  const db = createAdminSupabaseClient()

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const sessionName = formData.get('name') as string | null
  const baseDate = formData.get('base_date') as string | null

  if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })
  if (!sessionName) return NextResponse.json({ error: '세션 이름이 없습니다.' }, { status: 400 })
  if (!baseDate) return NextResponse.json({ error: '기준일이 없습니다.' }, { status: 400 })

  // File type validation
  const allowedTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
  ]
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: '파일 크기는 20MB 이하여야 합니다.' }, { status: 400 })
  }
  if (!allowedTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls)$/i)) {
    return NextResponse.json({ error: '엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.' }, { status: 400 })
  }

  const buffer = await file.arrayBuffer()
  const { styles, errors, sheetName } = await parseReorderExcel(buffer)

  if (styles.length === 0) {
    return NextResponse.json({ error: errors[0] ?? '파싱 실패', errors }, { status: 422 })
  }

  // 1. Create session
  const { data: session, error: sessionErr } = await db
    .from('reorder_sessions')
    .insert({ name: sessionName, base_date: baseDate })
    .select()
    .single()

  if (sessionErr) return NextResponse.json({ error: sessionErr.message }, { status: 500 })

  // 2. Insert styles + colors in bulk
  for (const style of styles) {
    const { data: dbStyle, error: styleErr } = await db
      .from('styles')
      .insert({
        session_id: session.id,
        code: style.code,
        type: style.type,
        price: style.price,
        days_since_inbound: style.days_since_inbound,
        stores: style.stores,
        plc: style.plc,
      })
      .select('id')
      .single()

    if (styleErr) {
      errors.push(`스타일 ${style.code} 저장 실패: ${styleErr.message}`)
      continue
    }

    const colorRows = style.colors.map(c => ({
      style_id: dbStyle.id,
      color_name: c.color_name,
      color_hex: c.color_hex,
      k: c.k, l: c.l, m: c.m,
      n: c.n, r: c.r, s: c.s, t: c.t,
      aj: c.aj,
    }))

    if (colorRows.length > 0) {
      const { error: colorErr } = await db.from('colors').insert(colorRows)
      if (colorErr) errors.push(`${style.code} 컬러 저장 실패: ${colorErr.message}`)
    }
  }

  return NextResponse.json({
    session_id: session.id,
    session_name: session.name,
    style_count: styles.length,
    sheet_used: sheetName,
    warnings: errors,
  }, { status: 201 })
}
