import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()

  const allowed = ['n', 'r', 's', 't', 'aj'] as const
  const hasAny = allowed.some(k => k in body)
  if (!hasAny) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const n  = 'n'  in body ? Number(body.n)  : null
  const r  = 'r'  in body ? Number(body.r)  : null
  const s  = 's'  in body ? Number(body.s)  : null
  const t  = 't'  in body ? Number(body.t)  : null
  const aj = 'aj' in body ? Number(body.aj) : null

  try {
    // COALESCE keeps existing value when param is null (field not provided)
    const [row] = await sql`
      UPDATE colors SET
        n  = COALESCE(${n}::integer,  n),
        r  = COALESCE(${r}::numeric,  r),
        s  = COALESCE(${s}::numeric,  s),
        t  = COALESCE(${t}::numeric,  t),
        aj = COALESCE(${aj}::integer, aj)
      WHERE id = ${id}
      RETURNING *
    `
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
