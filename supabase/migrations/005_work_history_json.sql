-- 005_work_history_json.sql
-- stations 테이블에 work_history JSONB 컬럼 추가
ALTER TABLE stations
  ADD COLUMN IF NOT EXISTS work_history JSONB DEFAULT '{}';

-- 기존 work_2021~2025 데이터를 work_history JSON으로 마이그레이션
UPDATE stations
SET work_history = (
  SELECT jsonb_strip_nulls(jsonb_build_object(
    '2021', work_2021,
    '2022', work_2022,
    '2023', work_2023,
    '2024', work_2024,
    '2025', work_2025
  ))
)
WHERE (
  work_2021 IS NOT NULL OR
  work_2022 IS NOT NULL OR
  work_2023 IS NOT NULL OR
  work_2024 IS NOT NULL OR
  work_2025 IS NOT NULL
)
AND (work_history IS NULL OR work_history = '{}');

-- 기존 컬럼은 하위 호환을 위해 유지 (향후 삭제 예정)
