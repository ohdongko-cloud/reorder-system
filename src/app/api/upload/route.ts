import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import type { StyleRow, ColorRow } from '@/types/reorder'

// Rate limit: 10 uploads / IP / minute
const rl = new Map<string, { count: number; resetAt: number }>()
function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rl.get(ip)
  if (!entry || now > entry.resetAt) { rl.set(ip, { count: 1, resetAt: now + 60_000 }); return true }
  if (entry.count >= 10) return false
  entry.count++
  return true
}
function getIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
}

export async function POST(req: NextRequest) {
  if (!checkRateLimit(getIp(req))) {
    return NextResponse.json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.' }, { status: 429 })
  }

  try {
    const body = await req.json()
    const { name, base_date, sheet_name, styles } = body as {
      name: string
      base_date: string
      sheet_name: string
      styles: (Omit<StyleRow, 'session_id'> & { colors: ColorRow[] })[]
    }

    if (!name)      return NextResponse.json({ error: '세션 이름이 없습니다.' }, { status: 400 })
    if (!base_date) return NextResponse.json({ error: '기준일이 없습니다.' }, { status: 400 })
    if (!Array.isArray(styles) || styles.length === 0) {
      return NextResponse.json({ error: '스타일 데이터가 없습니다.' }, { status: 400 })
    }

    // 1. Create session
    const [session] = await sql`
      INSERT INTO reorder_sessions (name, base_date)
      VALUES (${name}, ${base_date})
      RETURNING id, name
    `

    // 2. Bulk insert styles — 1 query instead of N
    const codes  = styles.map(s => s.code)
    const types  = styles.map(s => s.type)
    const prices = styles.map(s => s.price)
    const days   = styles.map(s => s.days_since_inbound)
    const stores = styles.map(s => s.stores)
    const plcs   = styles.map(s => s.plc)

    const insertedStyles = await sql`
      INSERT INTO styles (session_id, code, type, price, days_since_inbound, stores, plc)
      SELECT
        ${session.id}::uuid,
        unnest(${codes}::text[]),
        unnest(${types}::text[]),
        unnest(${prices}::int[]),
        unnest(${days}::int[]),
        unnest(${stores}::int[]),
        unnest(${plcs}::text[])
      RETURNING id, code
    `

    // Build code → DB ID map
    const codeToDbId = new Map(
      (insertedStyles as { id: string; code: string }[]).map(r => [r.code, r.id])
    )

    // 3. Collect all colors
    const allColors: (ColorRow & { db_style_id: string })[] = []
    for (const style of styles) {
      const dbId = codeToDbId.get(style.code)
      if (!dbId) continue
      for (const c of style.colors) {
        allColors.push({ ...c, db_style_id: dbId })
      }
    }

    // 4. Bulk insert colors — 1 query instead of M
    if (allColors.length > 0) {
      await sql`
        INSERT INTO colors (style_id, color_name, color_hex, k, l, m, n, r, s, t, aj)
        SELECT
          unnest(${allColors.map(c => c.db_style_id)}::uuid[]),
          unnest(${allColors.map(c => c.color_name)}::text[]),
          unnest(${allColors.map(c => c.color_hex ?? null)}::text[]),
          unnest(${allColors.map(c => c.k)}::int[]),
          unnest(${allColors.map(c => c.l)}::int[]),
          unnest(${allColors.map(c => c.m)}::int[]),
          unnest(${allColors.map(c => c.n)}::int[]),
          unnest(${allColors.map(c => c.r)}::numeric[]),
          unnest(${allColors.map(c => c.s)}::numeric[]),
          unnest(${allColors.map(c => c.t)}::numeric[]),
          unnest(${allColors.map(c => c.aj)}::int[])
      `
    }

    return NextResponse.json({
      session_id:   session.id,
      session_name: session.name,
      style_count:  styles.length,
      sheet_used:   sheet_name,
      warnings:     [],
    }, { status: 201 })

  } catch (e) {
    console.error('[upload] unhandled error:', e)
    return NextResponse.json({ error: `서버 오류: ${String(e)}` }, { status: 500 })
  }
}
