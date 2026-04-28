# 하민공조 KT기지국 현장관리 앱

## 저장소 & 배포
- **GitHub**: https://github.com/canadasilver/hamin-field-app
- **프론트엔드**: https://hamin-field-app.vercel.app (Vercel, main push 시 자동 배포)
- **백엔드**: Python FastAPI (Render, main push 시 자동 배포)
- **로컬 경로**: C:\claudecodefolder\hamin

## 기술 스택
- Frontend: React + Vite + TypeScript
- Backend: Python + FastAPI
- DB: Supabase (PostgreSQL)
- 지도: 카카오맵 API

## 브랜드 규칙
- **메인 컬러**: #215288 (파란색)
- KT 빨간색 #E4002B 절대 사용 금지 → 반드시 #215288로 대체

## 코드 작성 규칙
- 수정 후 반드시 GitHub push까지 완료
- 커밋 메시지: feat: / fix: / refactor: prefix 사용
- 환경변수는 절대 코드에 직접 입력 금지

## 작업 완료 체크리스트
- [ ] TypeScript 타입 오류 없음
- [ ] GitHub push 완료
- [ ] Vercel/Render 배포 확인 (Ready)

## 자주 발생하는 이슈
| 이슈 | 해결 |
|---|---|
| 배포 후 화면 미반영 | Ctrl+Shift+R 강력 새로고침 |
| TypeScript 빌드 오류 | frontend/src/services/api.ts 타입 확인 |
| API 연결 오류 | .env 파일 환경변수 확인 |
| cooling_info null | stations 테이블 JSON 컬럼 직접 확인 |
