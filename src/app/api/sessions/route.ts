import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'

export async function GET() {
  const db = createAdminSupabaseClient()
  const { data, error } = await db
    .from('session_summary')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const db = createAdminSupabaseClient()
  const body = await req.json()
  const { name, base_date } = body

  if (!name || !base_date) {
    return NextResponse.json({ error: 'name and base_date required' }, { status: 400 })
  }

  const { data, error } = await db
    .from('reorder_sessions')
    .insert({ name, base_date })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
