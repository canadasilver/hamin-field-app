# 하민공조 KT기지국 현장관리 앱 (hamin-field-app)

## 프로젝트 개요
KT 기지국 현장 관리를 위한 웹 애플리케이션.
직원 배분, 일정 관리, 동선 최적화, A/S 체크리스트, 냉방기 관리 등을 포함한 현장 관리 시스템.

---

## 저장소 및 배포 정보
- **GitHub**: https://github.com/canadasilver/hamin-field-app
- **프론트엔드 배포 (Vercel)**: https://hamin-field-app.vercel.app
- **백엔드 배포 (Render)**: Python FastAPI 서버
- **로컬 경로**: C:\claudecodefolder\hamin

---

## 기술 스택

### 프론트엔드
- React + Vite + TypeScript
- Vercel 자동 배포 (main 브랜치 push 시 자동 반영)
- 카카오맵 API (GPS 기반 동선 최적화)

### 백엔드
- Python + FastAPI
- Render 배포

### 데이터베이스
- Supabase (PostgreSQL)
- 주요 테이블: `stations`, `employees`, `schedules`, `work_history`
- `stations.cooling_info` : JSON 배열 컬럼 (냉방기 정보)

---

## 폴더 구조
```
C:\claudefolder\hamin\
├── frontend/                  ← React + Vite + TypeScript
│   ├── src/
│   │   ├── api/               ← API 호출 함수 (api.ts 등)
│   │   ├── components/        ← 공통 컴포넌트
│   │   ├── pages/             ← 페이지 컴포넌트
│   │   └── types/             ← TypeScript 타입 정의 (index.ts)
│   ├── package.json
│   └── vite.config.ts
├── backend/                   ← Python FastAPI
│   ├── main.py
│   ├── routers/               ← API 라우터 (work_history.py 등)
│   └── requirements.txt
├── supabase/
│   └── migrations/            ← DB 마이그레이션 SQL
├── CLAUDE.md                  ← 이 파일
└── .gitignore
```

---

## 브랜드 & 디자인 규칙
- **메인 컬러**: `#215288` (파란색)
- KT 빨간색(`#E4002B`)은 **절대 사용 금지** → 모두 `#215288`로 대체
- UI는 현장 직원이 모바일에서 쉽게 사용할 수 있도록 직관적으로 유지

---

## 주요 기능
1. **기지국 관리** - stations 테이블 기반, 냉방기 정보 포함
2. **직원 배분 및 일정 관리** - 직원별 작업 스케줄 관리
3. **동선 최적화** - 카카오맵 API + GPS 기반
4. **A/S 체크리스트** - 기지국별 점검/조치 이력
5. **작업이력 관리** - 연도별(2021~2025) 작업 기록
6. **대시보드** - 연간/월간 집계, 현황 요약
7. **냉방기 정보** - stations.cooling_info JSON 컬럼에서 읽기

---

## 코드 작성 규칙

### 공통
- 수정 후 **반드시 GitHub push까지 완료**
- TypeScript **타입 오류 없도록** 항상 확인
- 커밋 메시지: `feat:`, `fix:`, `refactor:` 등 prefix 사용

### 프론트엔드
- `cooling_info`는 `stations` 테이블의 JSON 컬럼에서 읽음 (별도 테이블 아님)
- API 호출은 `frontend/src/api/api.ts`에서 관리
- 타입 정의는 `frontend/src/types/index.ts`에서 관리
- 컴포넌트에 `station` prop 직접 전달 지양 → API로 직접 조회 방식 사용

### 백엔드
- FastAPI 라우터는 `backend/routers/` 폴더에 분리
- Supabase 클라이언트는 환경변수로 관리
- 관리자 전용 엔드포인트는 권한 체크 포함

---

## 환경변수 (절대 코드에 직접 입력 금지)

### 프론트엔드 (.env)
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_KAKAO_MAP_KEY=
VITE_API_URL=
```

### 백엔드 (.env)
```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
```

---

## 배포 프로세스

### 프론트엔드 (자동)
```
코드 수정 → git add → git commit → git push origin main
→ Vercel 자동 감지 → 자동 빌드 (약 16~18초) → 자동 배포
```

### 백엔드 (Render)
```
코드 수정 → git push → Render 자동 배포
```

### 수동 배포가 필요한 경우
```powershell
cd C:\claudefolder\hamin\frontend
npx vercel --prod
```

---

## DB 주요 테이블 구조

### stations (기지국)
```sql
id, name, address, lat, lng, 
cooling_info (JSON 배열),  -- 냉방기 정보
manager_name, manager_phone,
created_at
```

### work_history (작업이력)
```sql
id, station_id, employee_id,
work_2021, work_2022, work_2023, work_2024, work_2025,
created_at, updated_at
```

---

## 자주 발생하는 이슈 & 해결법

| 이슈 | 원인 | 해결 |
|---|---|---|
| 배포 후 화면 미반영 | 브라우저 캐시 | Ctrl+Shift+R 강력 새로고침 |
| TypeScript 빌드 오류 | 타입 불일치 | types/index.ts 인터페이스 확인 |
| API 연결 오류 | 환경변수 미설정 | .env 파일 확인 |
| cooling_info null | JSON 파싱 오류 | stations 테이블 직접 확인 |

---

## 작업 시 체크리스트
- [ ] TypeScript 타입 오류 없음
- [ ] 빌드 성공 확인 (`npm run build`)
- [ ] GitHub push 완료
- [ ] Vercel 배포 상태 확인 (Ready)
- [ ] 실제 앱에서 기능 동작 확인
