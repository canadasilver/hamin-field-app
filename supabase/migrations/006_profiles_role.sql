-- ============================================
-- profiles 테이블 생성 (role 컬럼 포함)
-- 기존 users 테이블과 별개로 Supabase Auth 연동용 프로필 테이블
-- ============================================

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255),
    name VARCHAR(100),
    role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee')),
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_employee_id ON profiles(employee_id);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 서비스 역할 전체 접근 허용
CREATE POLICY IF NOT EXISTS "Service role full access on profiles"
    ON profiles FOR ALL USING (true);

-- 본인 프로필 조회 허용
CREATE POLICY IF NOT EXISTS "Users can view own profile"
    ON profiles FOR SELECT USING (auth.uid() = id);

-- updated_at 자동 갱신
CREATE OR REPLACE TRIGGER tr_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 관리자 계정 role을 'admin'으로 업데이트
-- 아래 이메일을 실제 관리자 이메일로 변경하여 실행하세요.
-- ============================================

-- profiles 테이블에서 관리자 role 업데이트 (이메일 기준)
-- UPDATE profiles SET role = 'admin' WHERE email = 'admin@example.com';

-- users 테이블에서도 관리자 role 업데이트 (FastAPI 백엔드 auth용)
-- UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
