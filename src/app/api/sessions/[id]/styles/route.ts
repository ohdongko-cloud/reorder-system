import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = createAdminSupabaseClient()

  const { data: styles, error } = await db
    .from('styles')
    .select('*, colors(*)')
    .eq('session_id', id)
    .order('created_at', { referencedTable: 'colors', ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(styles ?? [])
}
