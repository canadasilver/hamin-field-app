-- 냉방기 정보 테이블
CREATE TABLE IF NOT EXISTS cooling_units (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    unit_number INT NOT NULL DEFAULT 1,          -- 냉방기 번호 (1, 2, 3...)
    capacity VARCHAR(50),                         -- 용량 (예: 5RT, 10HP)
    manufacturer VARCHAR(100),                    -- 제조사
    acquisition_date DATE,                        -- 취득일
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cooling_units_station_id ON cooling_units(station_id);
