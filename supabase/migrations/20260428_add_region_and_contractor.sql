-- stations 테이블에 지역 컬럼 추가
ALTER TABLE stations
  ADD COLUMN IF NOT EXISTS region_zone TEXT CHECK (region_zone IN ('north', 'south')),
  ADD COLUMN IF NOT EXISTS region_detail TEXT;

-- employees 테이블에 하청업체 구분 컬럼 추가
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'employee' CHECK (type IN ('employee', 'contractor')),
  ADD COLUMN IF NOT EXISTS company_name TEXT;

-- 기존 직원은 모두 employee로 설정
UPDATE employees SET type = 'employee' WHERE type IS NULL;
