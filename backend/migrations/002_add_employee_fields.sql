-- 직원 추가 정보 컬럼
-- Supabase SQL Editor에서 실행하세요

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS resident_number TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_number TEXT,
  ADD COLUMN IF NOT EXISTS memo TEXT;
