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

    const errors: string[] = []

    // 1. Create session
    const [session] = await sql`
      INSERT INTO reorder_sessions (name, base_date)
      VALUES (${name}, ${base_date})
      RETURNING id, name
    `

    // 2. Insert styles + colors
    for (const style of styles) {
      let dbStyleId: string
      try {
        const [dbStyle] = await sql`
          INSERT INTO styles (session_id, code, type, price, days_since_inbound, stores, plc)
          VALUES (${session.id}, ${style.code}, ${style.type}, ${style.price},
                  ${style.days_since_inbound}, ${style.stores}, ${style.plc})
          RETURNING id
        `
        dbStyleId = dbStyle.id
      } catch (e) {
        errors.push(`스타일 ${style.code} 저장 실패: ${String(e)}`)
        continue
      }

      for (const c of style.colors) {
        try {
          await sql`
            INSERT INTO colors (style_id, color_name, color_hex, k, l, m, n, r, s, t, aj)
            VALUES (${dbStyleId}, ${c.color_name}, ${c.color_hex ?? null},
                    ${c.k}, ${c.l}, ${c.m}, ${c.n},
                    ${c.r}, ${c.s}, ${c.t}, ${c.aj})
          `
        } catch (e) {
          errors.push(`${style.code}/${c.color_name} 저장 실패: ${String(e)}`)
        }
      }
    }

    return NextResponse.json({
      session_id:   session.id,
      session_name: session.name,
      style_count:  styles.length,
      sheet_used:   sheet_name,
      warnings:     errors,
    }, { status: 201 })

  } catch (e) {
    console.error('[upload] unhandled error:', e)
    return NextResponse.json({ error: `서버 오류: ${String(e)}` }, { status: 500 })
  }
}
