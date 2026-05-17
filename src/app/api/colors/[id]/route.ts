import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = createAdminSupabaseClient()
  const body = await req.json()

  // Only allow updating MD input fields + AJ
  const allowed = ['n', 'r', 's', 't', 'aj']
  const update: Record<string, number> = {}
  for (const key of allowed) {
    if (key in body) update[key] = Number(body[key])
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await db
    .from('colors')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
