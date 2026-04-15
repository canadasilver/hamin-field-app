-- 작업 이력 테이블 (직원별 수정/삭제 권한 지원)
-- Supabase SQL Editor에서 실행하세요

CREATE TABLE IF NOT EXISTS work_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES schedules(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  employee_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_history_station_id ON work_history(station_id);
CREATE INDEX IF NOT EXISTS idx_work_history_date ON work_history(date DESC);
CREATE INDEX IF NOT EXISTS idx_work_history_created_at ON work_history(created_at DESC);
