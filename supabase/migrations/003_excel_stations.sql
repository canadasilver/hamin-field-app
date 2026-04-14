-- ============================================
-- 엑셀 업로드 기반 기지국 관리 스키마
-- Supabase Dashboard > SQL Editor에서 실행하세요.
-- ============================================

-- 1. 업로드 파일 관리 테이블
CREATE TABLE IF NOT EXISTS uploaded_files (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    filename VARCHAR(500) NOT NULL,
    upload_date TIMESTAMPTZ DEFAULT now(),
    total_count INT DEFAULT 0,
    uploaded_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON uploaded_files FOR ALL USING (true);

-- 2. 기존 stations 테이블 삭제 후 재생성
-- (기존 schedules 등 FK 참조가 있으면 CASCADE로 삭제)
DROP TABLE IF EXISTS gps_logs CASCADE;
DROP TABLE IF EXISTS checklists CASCADE;
DROP TABLE IF EXISTS schedules CASCADE;
DROP TABLE IF EXISTS stations CASCADE;

CREATE TABLE stations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    file_id UUID REFERENCES uploaded_files(id) ON DELETE CASCADE,
    no INT,
    unique_no VARCHAR(100),
    network_group VARCHAR(100),
    location_code VARCHAR(100),
    equipment_type VARCHAR(100),
    station_id VARCHAR(100),
    station_name VARCHAR(200) NOT NULL,
    indoor_outdoor VARCHAR(20),
    operation_count INT,
    cooling_info JSONB DEFAULT '[]'::jsonb,
    barcode VARCHAR(100),
    work_2024 TEXT,
    work_2025 TEXT,
    defect TEXT,
    operation_team VARCHAR(100),
    manager VARCHAR(100),
    contact VARCHAR(50),
    address TEXT,
    building_name VARCHAR(200),
    planned_process VARCHAR(100),
    inspector VARCHAR(100),
    inspection_target VARCHAR(50),
    inspection_result VARCHAR(100),
    inspection_date VARCHAR(50),
    registration_status VARCHAR(50),
    registration_date VARCHAR(50),
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_stations_file_id ON stations(file_id);
CREATE INDEX idx_stations_station_name ON stations(station_name);
CREATE INDEX idx_stations_operation_team ON stations(operation_team);
CREATE INDEX idx_stations_manager ON stations(manager);
CREATE INDEX idx_stations_status ON stations(status);

ALTER TABLE stations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON stations FOR ALL USING (true);

CREATE OR REPLACE TRIGGER tr_stations_updated_at
    BEFORE UPDATE ON stations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. schedules 테이블 재생성 (stations FK 참조)
CREATE TABLE schedules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    scheduled_date DATE NOT NULL,
    sort_order INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    postponed_to DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_schedules_employee_date ON schedules(employee_id, scheduled_date);
CREATE INDEX idx_schedules_station ON schedules(station_id);
CREATE INDEX idx_schedules_status ON schedules(status);

ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON schedules FOR ALL USING (true);

CREATE OR REPLACE TRIGGER tr_schedules_updated_at
    BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 4. checklists 재생성
CREATE TABLE checklists (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE UNIQUE,
    item_1 BOOLEAN DEFAULT false,
    item_1_label VARCHAR(200) DEFAULT '장비 외관 점검',
    item_2 BOOLEAN DEFAULT false,
    item_2_label VARCHAR(200) DEFAULT '전원부 점검',
    item_3 BOOLEAN DEFAULT false,
    item_3_label VARCHAR(200) DEFAULT '케이블 연결 상태',
    item_4 BOOLEAN DEFAULT false,
    item_4_label VARCHAR(200) DEFAULT '신호 세기 측정',
    item_5 BOOLEAN DEFAULT false,
    item_5_label VARCHAR(200) DEFAULT '주변 환경 점검',
    notes TEXT,
    photo_urls TEXT[],
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON checklists FOR ALL USING (true);

-- 5. gps_logs 재생성
CREATE TABLE gps_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    event_type VARCHAR(20) NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE gps_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON gps_logs FOR ALL USING (true);
