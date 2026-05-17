import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const styles = await sql`
      SELECT
        s.id, s.session_id, s.code, s.type, s.price,
        s.days_since_inbound, s.stores, s.plc, s.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id',         c.id,
              'style_id',   c.style_id,
              'color_name', c.color_name,
              'color_hex',  c.color_hex,
              'k', c.k, 'l', c.l, 'm', c.m,
              'n', c.n, 'r', c.r, 's', c.s, 't', c.t,
              'aj', c.aj
            ) ORDER BY c.created_at
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'
        ) AS colors
      FROM styles s
      LEFT JOIN colors c ON c.style_id = s.id
      WHERE s.session_id = ${id}
      GROUP BY s.id
      ORDER BY s.created_at
    `
    return NextResponse.json(styles ?? [])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
