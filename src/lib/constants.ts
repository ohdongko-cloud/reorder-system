import type { PlcStage, StyleType } from '@/types/reorder'

export const TOTAL_STORES = 50

export const PLC_THRESHOLDS: Record<PlcStage, [number, number]> = {
  '도입기': [0, 35],
  '성장기': [36, 50],
  '유지기': [51, 65],
  '쇠퇴기': [66, Infinity],
}

export const PLC_T_FACTOR: Record<PlcStage, number> = {
  '도입기': 1.4,
  '성장기': 1.2,
  '유지기': 1.0,
  '쇠퇴기': 0.85,
}

export const PLC_COLORS: Record<PlcStage, string> = {
  '도입기': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '성장기': 'bg-blue-50 text-blue-700 border-blue-200',
  '유지기': 'bg-orange-50 text-orange-700 border-orange-200',
  '쇠퇴기': 'bg-red-50 text-red-700 border-red-200',
}

// 신규 4단계 효율 임계값 [Q threshold, efficiency]
export const NEW_EFFICIENCY_TIERS: Array<[number, number]> = [
  [0.25, 0.95],
  [0.15, 0.88],
  [0.10, 0.78],
  [0,    0.65],
]

// 동적 W: 시즌 진행률(%) 기준
// 90일을 1시즌으로 가정
export const SEASON_DAYS = 90
export const DYNAMIC_W_TIERS: Array<[number, number]> = [
  [0.8, 0.15],  // 진행률 80%+ → W=0.15
  [0.6, 0.25],  // 60%+ → W=0.25
  [0.3, 0.30],  // 30%+ → W=0.30
  [0,   0.35],  // 30% 미만 → W=0.35
]

export const FIXED_W_OLD = 0.3

export const SAFETY_FACTOR = 1.15  // AD = AC × 1.15

export const MIN_RECOMMEND_QTY = 300

// 발주 전략 5단계: W 조정값 (1=보수적, 3=표준, 5=공격적)
// AC=(L+AB)/(1-W)-L 공식에서 W가 높을수록 추천 수량 증가
// 공격적(5) → W 증가 → 추천↑ / 보수적(1) → W 감소 → 추천↓
export const STRATEGY_W_DELTA: Record<number, number> = {
  1: -0.10,   // 보수적 (W 감소 → 추천↓)
  2: -0.05,
  3:  0.00,   // 표준
  4: +0.05,
  5: +0.10,   // 공격적 (W 증가 → 추천↑)
}

export const STRATEGY_LABELS: Record<number, string> = {
  1: '매우 보수',
  2: '보수',
  3: '중간',
  4: '공격',
  5: '매우 공격',
}

// 발주 성향 버튼 색상 (PRD §2-2 기준)
export const STRATEGY_COLORS: Record<number, string> = {
  1: '#1d4ed8',
  2: '#3b82f6',
  3: '#059669',
  4: '#d97706',
  5: '#dc2626',
}

export const STYLE_TYPE_LABELS: Record<StyleType, string> = {
  normal: '일반',
  reorder: '리오더',
  test_cn: '사입',
}

export const STYLE_TYPE_COLORS: Record<StyleType, string> = {
  normal: 'bg-blue-50 text-blue-700 border-blue-200',
  reorder: 'bg-green-50 text-green-700 border-green-200',
  test_cn: 'bg-amber-50 text-amber-700 border-amber-200',
}

// 스타일 코드에서 타입 추론
export function inferStyleType(code: string): StyleType {
  const suffix2 = code.slice(-2).toUpperCase()
  const prev = code.slice(-2, -1).toUpperCase()
  if (['MS', 'NS'].includes(suffix2) || ['SS', 'TS', 'US'].includes(suffix2)) return 'test_cn'
  if (prev === 'Q') return 'reorder'
  return 'normal'
}

// 경과 일수로 PLC 단계 추론
export function inferPlc(days: number): PlcStage {
  if (days <= 35) return '도입기'
  if (days <= 50) return '성장기'
  if (days <= 65) return '유지기'
  return '쇠퇴기'
}
