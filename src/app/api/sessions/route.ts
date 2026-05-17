import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export async function GET() {
  try {
    const data = await sql`
      SELECT s.id, s.name, s.base_date, s.created_at,
             COUNT(st.id)::integer AS style_count
      FROM reorder_sessions s
      LEFT JOIN styles st ON st.session_id = s.id
      GROUP BY s.id, s.name, s.base_date, s.created_at
      ORDER BY s.created_at DESC
    `
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { name, base_date } = await req.json()
  if (!name || !base_date) {
    return NextResponse.json({ error: 'name and base_date required' }, { status: 400 })
  }
  try {
    const [session] = await sql`
      INSERT INTO reorder_sessions (name, base_date)
      VALUES (${name}, ${base_date})
      RETURNING *
    `
    return NextResponse.json(session, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
