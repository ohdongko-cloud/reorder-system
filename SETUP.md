# MI 리오더 자동화 시스템 — 배포 가이드

## 1. Supabase 프로젝트 생성

1. [supabase.com](https://supabase.com) → New project 생성
2. **SQL Editor** → `supabase/schema.sql` 전체 내용 붙여넣기 → Run
3. **Settings → API** 페이지에서 아래 값 복사:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

## 2. 로컬 개발

```bash
cd reorder-preview

# .env.local 생성
cp .env.local.example .env.local
# .env.local 파일에 위 Supabase 값 입력

npm install
npm run dev
# → http://localhost:3000
```

## 3. GitHub 업로드

```bash
cd reorder-preview
git init
git add .
git commit -m "initial commit"

# GitHub에서 새 레포 만들고:
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

## 4. Vercel 배포

1. [vercel.com](https://vercel.com) → Import Git Repository → reorder-preview 레포 선택
2. **Environment Variables** 탭에 3개 값 입력:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ```
3. Deploy → 완료

## 5. Supabase Auth 사용자 추가

Supabase 대시보드 → **Authentication → Users → Invite user**
팀원 이메일로 초대하면 가입 링크가 전송됩니다.

---

## 엑셀 업로드 주의사항

- `리오더예상_CHECK` 시트가 포함된 파일 업로드
- 컬럼 구조가 다를 경우 `src/lib/excel-parser.ts`의 `BI_COL` 상수 조정 필요
- 현재 파싱 기준: A=스타일코드, B=컬러, C=가격, D=매장수, E=경과일수, I=생산, L=입고, M=반품, N=주판량, R=재고조정배수, S=판매기간, T=T값, AJ=확정발주

## 핵심 수식 위치

| 파일 | 내용 |
|---|---|
| `src/lib/reorder-calc.ts` | 기존/신규 리오더 계산 로직 |
| `src/lib/constants.ts` | PLC 보정계수, W 임계값, 효율 4단계 |
| `src/store/reorder-store.ts` | 상태 관리, 실시간 재계산 |
| `src/lib/excel-parser.ts` | BI 시트 파싱 규칙 |
| `supabase/schema.sql` | DB 스키마 + RLS 정책 |
