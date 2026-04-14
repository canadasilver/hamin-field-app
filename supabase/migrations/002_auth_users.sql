-- ============================================
-- 사용자 프로필 테이블 (선택사항)
-- Supabase Dashboard > SQL Editor에서 실행하세요.
-- 이 테이블 없이도 auth.users의 user_metadata로 동작합니다.
-- ============================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee')),
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON users FOR ALL USING (true);

CREATE OR REPLACE TRIGGER tr_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
