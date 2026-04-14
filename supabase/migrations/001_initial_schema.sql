-- ============================================
-- KT 기지국 현장관리 시스템 DB 스키마
-- ============================================

-- 1. 기지국 테이블
CREATE TABLE stations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(200) NOT NULL,              -- 기지국명
    manager VARCHAR(100) NOT NULL,           -- 담당자
    contact VARCHAR(20) NOT NULL,            -- 연락처
    address TEXT NOT NULL,                   -- 주소
    work_description TEXT,                   -- 작업내용
    lat DOUBLE PRECISION,                    -- 위도 (주소→좌표 변환)
    lng DOUBLE PRECISION,                    -- 경도
    status VARCHAR(20) DEFAULT 'pending',    -- pending / assigned / completed
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 직원 테이블
CREATE TABLE employees (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,              -- 이름
    contact VARCHAR(20) NOT NULL,            -- 연락처
    max_daily_tasks INT DEFAULT 5,           -- 하루 최대 작업수
    per_task_rate INT DEFAULT 0,             -- 건당 단가 (원)
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. 직원 근무불가 날짜
CREATE TABLE employee_unavailable_dates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    unavailable_date DATE NOT NULL,
    reason VARCHAR(200),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(employee_id, unavailable_date)
);

-- 4. 작업 일정 테이블
CREATE TABLE schedules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    scheduled_date DATE NOT NULL,
    sort_order INT DEFAULT 0,                -- 동선 순서
    status VARCHAR(20) DEFAULT 'pending',    -- pending / in_progress / completed / postponed
    started_at TIMESTAMPTZ,                  -- GPS 감지 작업시작 시간
    completed_at TIMESTAMPTZ,                -- GPS 감지 작업완료 시간
    postponed_to DATE,                       -- 미루기한 날짜
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. A/S 체크리스트 테이블
CREATE TABLE checklists (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE UNIQUE,
    item_1 BOOLEAN DEFAULT false,            -- 체크항목 1
    item_1_label VARCHAR(200) DEFAULT '장비 외관 점검',
    item_2 BOOLEAN DEFAULT false,            -- 체크항목 2
    item_2_label VARCHAR(200) DEFAULT '전원부 점검',
    item_3 BOOLEAN DEFAULT false,            -- 체크항목 3
    item_3_label VARCHAR(200) DEFAULT '케이블 연결 상태',
    item_4 BOOLEAN DEFAULT false,            -- 체크항목 4
    item_4_label VARCHAR(200) DEFAULT '신호 세기 측정',
    item_5 BOOLEAN DEFAULT false,            -- 체크항목 5
    item_5_label VARCHAR(200) DEFAULT '주변 환경 점검',
    notes TEXT,                              -- 특이사항
    photo_urls TEXT[],                       -- 사진 URL 배열
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. GPS 로그 테이블
CREATE TABLE gps_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    event_type VARCHAR(20) NOT NULL,         -- arrival / departure / tracking
    recorded_at TIMESTAMPTZ DEFAULT now()
);

-- 7. 엑셀 업로드 이력
CREATE TABLE upload_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    file_name VARCHAR(500) NOT NULL,
    total_rows INT DEFAULT 0,
    success_rows INT DEFAULT 0,
    failed_rows INT DEFAULT 0,
    uploaded_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 인덱스
-- ============================================
CREATE INDEX idx_stations_status ON stations(status);
CREATE INDEX idx_stations_lat_lng ON stations(lat, lng);
CREATE INDEX idx_employees_active ON employees(is_active);
CREATE INDEX idx_unavailable_employee_date ON employee_unavailable_dates(employee_id, unavailable_date);
CREATE INDEX idx_schedules_employee_date ON schedules(employee_id, scheduled_date);
CREATE INDEX idx_schedules_station ON schedules(station_id);
CREATE INDEX idx_schedules_status ON schedules(status);
CREATE INDEX idx_schedules_date ON schedules(scheduled_date);
CREATE INDEX idx_gps_logs_schedule ON gps_logs(schedule_id);
CREATE INDEX idx_gps_logs_employee ON gps_logs(employee_id);

-- ============================================
-- updated_at 자동 갱신 트리거
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_stations_updated_at
    BEFORE UPDATE ON stations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_employees_updated_at
    BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_schedules_updated_at
    BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_checklists_updated_at
    BEFORE UPDATE ON checklists
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RLS (Row Level Security) 정책
-- ============================================
ALTER TABLE stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_unavailable_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_history ENABLE ROW LEVEL SECURITY;

-- 서비스 역할은 모든 접근 허용 (백엔드 서버에서 사용)
CREATE POLICY "Service role full access" ON stations FOR ALL USING (true);
CREATE POLICY "Service role full access" ON employees FOR ALL USING (true);
CREATE POLICY "Service role full access" ON employee_unavailable_dates FOR ALL USING (true);
CREATE POLICY "Service role full access" ON schedules FOR ALL USING (true);
CREATE POLICY "Service role full access" ON checklists FOR ALL USING (true);
CREATE POLICY "Service role full access" ON gps_logs FOR ALL USING (true);
CREATE POLICY "Service role full access" ON upload_history FOR ALL USING (true);

-- ============================================
-- 대시보드용 뷰
-- ============================================

-- 직원별 월간 작업 통계 뷰
CREATE VIEW v_employee_monthly_stats AS
SELECT
    e.id AS employee_id,
    e.name AS employee_name,
    e.per_task_rate,
    DATE_TRUNC('month', s.scheduled_date) AS month,
    COUNT(*) FILTER (WHERE s.status = 'completed') AS completed_count,
    COUNT(*) FILTER (WHERE s.status = 'pending') AS pending_count,
    COUNT(*) FILTER (WHERE s.status = 'postponed') AS postponed_count,
    COUNT(*) AS total_count,
    COUNT(*) FILTER (WHERE s.status = 'completed') * e.per_task_rate AS monthly_pay
FROM employees e
LEFT JOIN schedules s ON e.id = s.employee_id
GROUP BY e.id, e.name, e.per_task_rate, DATE_TRUNC('month', s.scheduled_date);

-- 일별 작업 현황 뷰
CREATE VIEW v_daily_work_summary AS
SELECT
    s.scheduled_date,
    COUNT(*) AS total_tasks,
    COUNT(*) FILTER (WHERE s.status = 'completed') AS completed,
    COUNT(*) FILTER (WHERE s.status = 'in_progress') AS in_progress,
    COUNT(*) FILTER (WHERE s.status = 'pending') AS pending,
    COUNT(*) FILTER (WHERE s.status = 'postponed') AS postponed
FROM schedules s
GROUP BY s.scheduled_date
ORDER BY s.scheduled_date DESC;
