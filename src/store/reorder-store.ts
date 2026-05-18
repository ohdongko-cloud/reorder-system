import { create } from 'zustand'
import type { StyleRow, ColorRow, ReorderSession, Strategy } from '@/types/reorder'
import { calcOld, calcNewWithPrevYear, calcDeltaPct } from '@/lib/reorder-calc'
import { MIN_RECOMMEND_QTY, inferBadges } from '@/lib/constants'

interface ReorderState {
  sessions: ReorderSession[]
  currentSession: ReorderSession | null
  styles: StyleRow[]
  isLoading: boolean
  isSaving: boolean

  setSessions: (sessions: ReorderSession[]) => void
  setCurrentSession: (session: ReorderSession | null) => void
  setStyles: (styles: StyleRow[]) => void
  setLoading: (v: boolean) => void

  updateColorField: (
    styleId: string,
    colorId: string,
    field: 'n' | 's' | 't' | 'r' | 'aj' | 'weight' | 'strategy',
    value: number
  ) => void

  setStyleStrategy: (styleId: string, strategy: Strategy) => void
  setAllStrategies: (strategy: Strategy) => void

  recalcStyle: (styleId: string) => void
  recalcAll: () => void

  // Returns only styles where at least 1 color has calcNew >= MIN_RECOMMEND_QTY
  getFilteredStyles: () => StyleRow[]

  getTotals: () => { totalOld: number; totalNew: number; totalAj: number }
  getFilteredTotals: () => { totalOld: number; totalNew: number; totalAj: number }
}

function recalcColor(color: ColorRow, style: StyleRow): ColorRow {
  const strategyToUse = color.strategy ?? style.strategy

  // 스타일 전체 누적입고량 합계 (N_prev 컬러 배분용)
  const totalStyleL = style.colors.reduce((sum, c) => sum + c.l, 0)

  const old = calcOld(color.l, color.m, color.n, color.r, color.s, color.t, style.stores)
  const nw = calcNewWithPrevYear(
    color.l, color.m, color.n, color.r, color.s, color.t,
    style.stores, style.plc, style.days_since_inbound, strategyToUse,
    style.prevYear ?? null,
    totalStyleL
  )

  return {
    ...color,
    calcOld: old?.ad ?? null,
    calcNew: nw?.ad ?? null,
    qRate: old?.q ?? null,
    uOld: old?.u ?? null,
    uNew: nw?.u ?? null,
    wUsed: nw?.w ?? null,
    delta: (old && nw) ? calcDeltaPct(old.ad, nw.ad) : null,
  }
}

function applyColorDefaults(c: ColorRow): ColorRow {
  return {
    ...c,
    s: c.s || 5,
    weight: c.weight ?? 1.0,
    strategy: c.strategy ?? 3,
  }
}

export const useReorderStore = create<ReorderState>((set, get) => ({
  sessions: [],
  currentSession: null,
  styles: [],
  isLoading: false,
  isSaving: false,

  setSessions: (sessions) => set({ sessions }),
  setCurrentSession: (session) => set({ currentSession: session }),
  setLoading: (v) => set({ isLoading: v }),

  setStyles: (styles) => {
    const calculated = styles.map(style => {
      const s: StyleRow = {
        ...style,
        strategy: style.strategy ?? 3,
        badges: inferBadges(style.code),
        colors: [],
      }
      s.colors = style.colors.map(c => recalcColor(applyColorDefaults(c), s))
      return s
    })
    set({ styles: calculated })
  },

  updateColorField: (styleId, colorId, field, value) => {
    set(state => {
      const styles = state.styles.map(style => {
        if (style.id !== styleId) return style
        const colors = style.colors.map(c => {
          if (c.id !== colorId) return c
          const updated = { ...c, [field]: value }
          // weight doesn't affect calc, but we still call recalcColor for consistency
          return recalcColor(updated, style)
        })
        return { ...style, colors }
      })
      return { styles }
    })
  },

  setStyleStrategy: (styleId, strategy) => {
    set(state => {
      const styles = state.styles.map(style => {
        if (style.id !== styleId) return style
        const updated = { ...style, strategy, colors: style.colors.map(c => ({ ...c, strategy })) }
        return { ...updated, colors: updated.colors.map(c => recalcColor(c, updated)) }
      })
      return { styles }
    })
  },

  setAllStrategies: (strategy) => {
    set(state => ({
      styles: state.styles.map(style => {
        const updated = { ...style, strategy, colors: style.colors.map(c => ({ ...c, strategy })) }
        return { ...updated, colors: updated.colors.map(c => recalcColor(c, updated)) }
      }),
    }))
  },

  recalcStyle: (styleId) => {
    set(state => {
      const styles = state.styles.map(style => {
        if (style.id !== styleId) return style
        return { ...style, colors: style.colors.map(c => recalcColor(c, style)) }
      })
      return { styles }
    })
  },

  recalcAll: () => {
    set(state => ({
      styles: state.styles.map(style => ({
        ...style,
        colors: style.colors.map(c => recalcColor(c, style)),
      })),
    }))
  },

  getFilteredStyles: () => {
    return get().styles.filter(style =>
      style.colors.some(c => (c.calcNew ?? 0) >= MIN_RECOMMEND_QTY)
    )
  },

  getTotals: () => {
    const { styles } = get()
    let totalOld = 0, totalNew = 0, totalAj = 0
    for (const style of styles) {
      for (const c of style.colors) {
        totalOld += c.calcOld ?? 0
        totalNew += c.calcNew ?? 0
        totalAj  += c.aj
      }
    }
    return { totalOld, totalNew, totalAj }
  },

  getFilteredTotals: () => {
    const styles = get().getFilteredStyles()
    let totalOld = 0, totalNew = 0, totalAj = 0
    for (const style of styles) {
      for (const c of style.colors) {
        totalOld += c.calcOld ?? 0
        totalNew += c.calcNew ?? 0
        totalAj  += c.aj
      }
    }
    return { totalOld, totalNew, totalAj }
  },
}))
