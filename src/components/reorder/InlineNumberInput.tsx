'use client'

import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  value: number
  onChange: (v: number) => void
  onBlur?: (v: number) => void
  min?: number
  max?: number
  step?: number
  className?: string
  disabled?: boolean
}

export function InlineNumberInput({ value, onChange, onBlur, min, max, step = 1, className, disabled }: Props) {
  const [editing, setEditing] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  return (
    <input
      ref={ref}
      type="number"
      disabled={disabled}
      value={editing ? undefined : value}
      defaultValue={value}
      min={min}
      max={max}
      step={step}
      onFocus={() => {
        setEditing(true)
        ref.current?.select()
      }}
      onChange={e => onChange(Number(e.target.value))}
      onBlur={e => {
        setEditing(false)
        onBlur?.(Number(e.target.value))
      }}
      className={cn(
        'w-14 px-1.5 py-0.5 text-right text-xs border rounded',
        'bg-amber-50 border-slate-300 focus:bg-blue-50 focus:border-blue-400 focus:outline-none',
        'disabled:bg-slate-50 disabled:text-slate-400 disabled:pointer-events-none',
        '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
        className
      )}
    />
  )
}
