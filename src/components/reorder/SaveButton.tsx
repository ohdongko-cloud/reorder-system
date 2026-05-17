'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useReorderStore } from '@/store/reorder-store'
import { Save } from 'lucide-react'
import { toast } from 'sonner'

export function SaveButton() {
  const [saving, setSaving] = useState(false)
  const styles = useReorderStore(s => s.styles)

  async function handleSave() {
    setSaving(true)
    let ok = 0, fail = 0

    const updates = styles.flatMap(style =>
      style.colors.map(c => ({
        id: c.id,
        n: c.n, r: c.r, s: c.s, t: c.t, aj: c.aj,
      }))
    )

    await Promise.all(
      updates.map(async (u) => {
        try {
          const res = await fetch(`/api/colors/${u.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(u),
          })
          if (res.ok) ok++
          else fail++
        } catch {
          fail++
        }
      })
    )

    setSaving(false)
    if (fail === 0) toast.success(`${ok}개 컬러 저장 완료`)
    else toast.warning(`${ok}개 저장됨, ${fail}개 실패`)
  }

  return (
    <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
      <Save className="w-3.5 h-3.5" />
      {saving ? '저장 중...' : '저장'}
    </Button>
  )
}
