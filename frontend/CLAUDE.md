# Frontend 개발 규칙

## 환경변수 (.env)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_KAKAO_MAP_KEY=
VITE_API_URL=

## 폴더 구조
frontend/src/
├── admin/pages/     ← 관리자 페이지 (Dashboard, Stations, Employees 등)
├── components/      ← 공통 컴포넌트
├── pages/           ← 현장 직원용 페이지
├── services/
│   └── api.ts       ← 모든 API 호출 함수 (여기서만 관리)
└── types/           ← TypeScript 타입 정의

## API 규칙
- 모든 API 호출은 frontend/src/services/api.ts 에서만 관리
- 컴포넌트에 station prop 직접 전달 지양 → API로 직접 조회

## DB 연동 주의사항
- cooling_info : stations 테이블의 JSON 배열 컬럼 (별도 테이블 아님)
- stationApi.list() 기본 limit=200, 전체 조회 시 명시 필요

## 주요 테이블
| 테이블 | 설명 |
|---|---|
| stations | 기지국 (cooling_info JSON 포함) |
| employees | 직원 |
| schedules | 작업 일정 |
| work_history | 연도별 작업이력 (2021~2025) |

## TypeScript 규칙
- 수정 후 반드시 npx tsc --noEmit 으로 타입 오류 확인
- any 타입 사용 최소화
- 새 API 응답 타입은 파일 상단 interface 섹션에 추가
