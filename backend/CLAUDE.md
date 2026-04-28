# Backend 개발 규칙

## 환경변수 (.env)
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

## 폴더 구조
backend/
├── app/
│   ├── api/routes/   ← API 라우터 분리 (dashboard.py, stations.py 등)
│   ├── core/         ← 설정, 환경변수
│   └── schemas/      ← Pydantic 스키마
└── requirements.txt

## 코드 규칙
- 라우터는 반드시 backend/app/api/routes/ 폴더에 분리
- Supabase 클라이언트는 app/api/deps.py 의 get_supabase() 사용
- 관리자 전용 엔드포인트는 권한 체크 포함
- 페이징 처리: 대량 데이터는 1000건 단위로 분할 조회

## 대시보드 집계 규칙
- 기지국 중복 제거: station_id 기준 (STATUS_PRIORITY 로직 사용)
- 완료 스케줄은 completed_at 기준, 나머지는 scheduled_date 기준 집계
- _dedupe_stations() 함수 재사용할 것
