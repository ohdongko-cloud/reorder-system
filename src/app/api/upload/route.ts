import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { parseReorderExcel } from '@/lib/excel-parser'

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
    const formData   = await req.formData()
    const file        = formData.get('file') as File | null
    const sessionName = formData.get('name') as string | null
    const baseDate    = formData.get('base_date') as string | null

    if (!file)        return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })
    if (!sessionName) return NextResponse.json({ error: '세션 이름이 없습니다.' }, { status: 400 })
    if (!baseDate)    return NextResponse.json({ error: '기준일이 없습니다.' }, { status: 400 })

    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: '파일 크기는 20MB 이하여야 합니다.' }, { status: 400 })
    }
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      return NextResponse.json({ error: '엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.' }, { status: 400 })
    }

    const buffer = await file.arrayBuffer()
    const { styles, errors, sheetName } = await parseReorderExcel(buffer)

    if (styles.length === 0) {
      return NextResponse.json({ error: errors[0] ?? '파싱 실패 — BI 시트가 없거나 MI 스타일 데이터를 찾을 수 없습니다.', errors }, { status: 422 })
    }

    // 1. Create session
    const [session] = await sql`
      INSERT INTO reorder_sessions (name, base_date)
      VALUES (${sessionName}, ${baseDate})
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
            VALUES (${dbStyleId}, ${c.color_name}, ${c.color_hex},
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
      sheet_used:   sheetName,
      warnings:     errors,
    }, { status: 201 })

  } catch (e) {
    console.error('[upload] unhandled error:', e)
    return NextResponse.json({ error: `서버 오류: ${String(e)}` }, { status: 500 })
  }
}
