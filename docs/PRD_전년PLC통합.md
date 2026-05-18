# PRD: 전년 PLC 패턴 기반 리오더 로직 개선

**버전**: v1.0  
**작성일**: 2026-05-18  
**담당**: Claude Code

---

## 1. 배경 및 목적

### 1.1 배경
기존 리오더 시스템은 현재 시즌의 BI 데이터만으로 발주 수량을 계산하였다.  
주판량(N)은 BI_요일판매 기간 판매금액을 단가로 나누어 추정하는 방식이었으며,  
판매 지속 기간(S)은 MD가 수동으로 입력하는 값이었다.

### 1.2 신규 데이터
- **BI_스타일별전년**: 전년 동 주간(예: 2025-05-12~18) 스타일별 실적 데이터
- **BI_전년PLC**: 전년 시즌 전체(~56주) 주별 누적 정상판매량 시계열 데이터

### 1.3 목적
- 전년 동 주간 실적으로 N(주판량) 정밀도 향상
- 전년 PLC 곡선에서 잔여 판매 기간(S) 자동 추정
- 전년 누적 판매율로 PLC 단계 보정
- 전년T 컬럼에 전년 동 주간 판매량 표시로 MD 참고 가능

---

## 2. 데이터 구조

### 2.1 BI_스타일별전년 시트

| 인덱스(0-based) | 컬럼명 | 설명 |
|---|---|---|
| 3 | 스타일코드 | 스타일 식별자 (BI 시트와 매핑) |
| 14 | MDP유형(Now) | PLC 유형 레퍼런스 |
| 15 | 발주량 | 전년 발주량 |
| 19 | 누적입고량 | 전년 누적 입고량 |
| 25 | 누적 판매량 | 전년 누적 총 판매량 |
| 26 | 기간 판매량 | **전년 동 주간 판매량** (N_prev 기준) |
| 33 | 누적 정상판매량 | 전년 누적 정상가 판매량 |
| 34 | 기간 정상판매량 | **전년 동 주간 정상판매량** (N_prev 핵심) |
| 39 | 누적 입고대비정판율 | 전년 누적 판매율 (%) |
| 40 | 기간판매율[입고대비] | 전년 기간 판매율 (%) |

**데이터 시작**: 행 6 (행5는 집계 행, 행6부터 스타일 개별 데이터)  
**필터 조건**: 스타일코드 'MI'로 시작하는 행만 파싱

### 2.2 BI_전년PLC 시트

| 인덱스(0-based) | 컬럼명 | 설명 |
|---|---|---|
| 3 | 스타일코드 | 스타일 식별자 |
| 13 | 전체 결과 | 전년 시즌 총 누적 정상판매량 |
| 14~55 | 주별 정상판매량 | 56주 주별 누적 정상판매량 배열 |

**주차 헤더 형식**: "MM/DD~MM/DD" (예: "05/12~05/18")  
**현재 주차 자동 감지**: BI 시트 참조일 → 같은 형식의 BI_전년PLC 컬럼 찾기  
**데이터 시작**: 행 8 (행5~7은 집계 행)

---

## 3. 기능 명세

### 3.1 전년 데이터 파싱 (excel-parser.ts)

#### buildPrevYearStyleMap(wb)
- BI_스타일별전년 시트 파싱
- styleCode → PrevYearStyleData 맵 반환
- 시트 없으면 빈 맵 반환 (하위 호환)

#### buildPrevYearPlcMap(wb, refDateStr)
- BI_전년PLC 시트 파싱
- refDateStr에서 "MM/DD~MM/DD" 형식의 현재 주차 키 계산
- 해당 컬럼을 기준으로 현재까지 누적과 이후 잔여 분리
- styleCode → PrevYearPlcData 맵 반환

### 3.2 타입 확장 (types/reorder.ts)

```typescript
export interface PrevYearStyleData {
  orderQty: number          // 전년 발주량
  cumInboundQty: number     // 전년 누적입고량
  cumSalesQty: number       // 전년 누적 판매량
  weekSalesQty: number      // 전년 동 주간 판매량
  cumNormSalesQty: number   // 전년 누적 정상판매량
  weekNormSalesQty: number  // 전년 동 주간 정상판매량 ← N_prev 핵심
  cumSalesRate: number      // 전년 누적 입고대비 판매율 (0~100)
  weekSalesRate: number     // 전년 기간 판매율 (0~100)
}

export interface PrevYearPlcData {
  totalNormSales: number    // 전년 시즌 총 정상판매량
  salesBeforeCurrent: number  // 현재 주차까지 누적
  salesAfterCurrent: number   // 현재 주차 이후 잔여
  currentWeekSales: number    // 현재 주차 판매량
  estRemainWeeks: number      // 잔여 예상 주수
  weeklyNormSales: number[]   // 전체 주별 배열 (56개)
}

// StyleRow에 추가
prevYear?: {
  style: PrevYearStyleData
  plc: PrevYearPlcData
} | null
```

### 3.3 계산 로직 개선 (reorder-calc.ts)

#### N 보정 (주판량)
```
N_prev = weekNormSalesQty (전년 동 주간 정상판매량)
N_adjusted = N_current × 0.5 + N_prev × 0.5
```
- N_prev가 없거나 0이면 현재 N 유지
- 스타일 단위 N_prev → 컬러별 입고(L) 비율로 배분
- 결과는 `n_prevAdjusted` 필드로 저장, 기존 `n` 필드는 유지 (MD가 수동 수정 가능)

#### S 보정 (판매 지속 기간)
```
S_prev = estRemainWeeks (BI_전년PLC 기준 잔여 예상 주수)
S_adjusted = 가중치 적용 값
```
- estRemainWeeks 계산: salesAfterCurrent / currentWeekSales
- S_prev가 없거나 0이면 기본값(5주) 유지
- S는 MD 수동 입력 우선, prevYear 값은 초기 추정값으로 활용

#### PLC 보정
- 전년 누적 판매율 (cumSalesRate)으로 days_since_inbound 보정
- cumSalesRate > 80% → 입고 후 경과일 = max(days, 80)으로 쇠퇴기 강화
- cumSalesRate 50~80% → 유지기 구간으로 보정
- 이 보정은 전년 동일 스타일 기준이므로 선택적 적용

### 3.4 UI 표시 (CalcResultsPage)

#### 전년T 컬럼
- 기존: 빈칸 또는 T값 참고용
- 변경: **전년 동 주간 정상판매량** 표시
  - 값이 있으면: `NNN` (숫자, blue 색상)
  - 없으면: `—` (em dash)
- 헤더 툴팁: "전년 동 주간 정상판매량 (N 보정 기준)"

#### 소계행 전년T
- 해당 스타일의 컬러별 prevYear.weekNormSalesQty 합계

#### 스타일 상세 표시
- 스타일명 아래 전년 누적 판매율 뱃지 추가 (선택)
  - `판매율 XX%` (회색 소형 뱃지)

---

## 4. 하위 호환성

- 두 신규 시트가 없는 파일도 정상 작동 (기존 로직 유지)
- prevYear 데이터 없는 스타일은 기존 calcNew 로직 그대로 사용
- 파일 포맷: xlsx 시트명 대소문자 구분 없이 탐지 ('BI_스타일별전년', 'BI_전년PLC')

---

## 5. 개발 범위 요약

| 파일 | 변경 내용 |
|---|---|
| `src/types/reorder.ts` | PrevYearStyleData, PrevYearPlcData 타입 추가, StyleRow.prevYear 필드 추가 |
| `src/lib/excel-parser.ts` | buildPrevYearStyleMap, buildPrevYearPlcMap 함수 추가, parseFromBISheets 통합 |
| `src/lib/reorder-calc.ts` | N_prev/S_prev 보정 로직, calcNewAdjusted 함수 추가 |
| `src/store/reorder-store.ts` | recalcColor에서 prevYear 데이터 활용 |
| `src/components/reorder/pages/CalcResultsPage.tsx` | 전년T 컬럼에 weekNormSalesQty 표시 |

---

## 6. 비고

- 전년 데이터는 참고용이며, MD의 수동 입력이 최우선
- 전년 동 주간 데이터이므로 시즌 전환기(신상품 vs 이월 등)는 주의 필요
- 향후: 전년 PLC 곡선 시각화(스파크라인), 발주량 시나리오 비교 기능 확장 예정
