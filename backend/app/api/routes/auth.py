from fastapi import APIRouter, HTTPException, Header
from app.api.deps import get_supabase
from app.schemas.auth import LoginRequest, SignUpRequest, AuthResponse, UserResponse, username_to_email

router = APIRouter(prefix="/auth", tags=["인증"])


def _get_user_profile(db, user_id: str, fallback_meta: dict | None = None) -> dict:
    """users 테이블에서 프로필 조회, 없으면 auth metadata 사용"""
    try:
        result = db.table("users").select("*").eq("id", user_id).single().execute()
        if result.data:
            return result.data
    except Exception:
        pass

    # users 테이블이 없거나 데이터가 없으면 auth metadata 활용
    if fallback_meta:
        return {
            "id": user_id,
            "email": fallback_meta.get("email", ""),
            "name": fallback_meta.get("name", fallback_meta.get("email", "").split("@")[0]),
            "role": fallback_meta.get("role", "employee"),
            "employee_id": fallback_meta.get("employee_id"),
            "is_active": True,
            "created_at": fallback_meta.get("created_at", ""),
            "updated_at": fallback_meta.get("updated_at", ""),
        }
    raise HTTPException(404, "사용자 프로필을 찾을 수 없습니다.")


@router.post("/login", response_model=AuthResponse)
async def login(req: LoginRequest):
    """아이디/비밀번호 로그인"""
    db = get_supabase()
    email = username_to_email(req.username)
    try:
        auth_res = db.auth.sign_in_with_password({
            "email": email,
            "password": req.password,
        })
    except Exception:
        raise HTTPException(401, "아이디 또는 비밀번호가 올바르지 않습니다.")

    user = auth_res.user
    meta = {
        "email": user.email,
        "created_at": str(user.created_at) if user.created_at else "",
        "updated_at": str(user.updated_at) if user.updated_at else "",
        **(user.user_metadata or {}),
    }

    profile = _get_user_profile(db, str(user.id), fallback_meta=meta)

    if not profile.get("is_active", True):
        raise HTTPException(403, "비활성화된 계정입니다.")

    return {
        "access_token": auth_res.session.access_token,
        "user": profile,
    }


@router.post("/signup", response_model=AuthResponse)
async def signup(req: SignUpRequest):
    """회원가입"""
    db = get_supabase()
    try:
        auth_res = db.auth.admin.create_user({
            "email": req.email,
            "password": req.password,
            "email_confirm": True,
            "user_metadata": {
                "name": req.name,
                "role": req.role,
                "employee_id": str(req.employee_id) if req.employee_id else None,
            },
        })
    except Exception as e:
        error_msg = str(e)
        if "already" in error_msg.lower():
            raise HTTPException(400, "이미 등록된 이메일입니다.")
        raise HTTPException(400, f"회원가입 실패: {error_msg}")

    user = auth_res.user
    if not user:
        raise HTTPException(400, "회원가입에 실패했습니다.")

    # users 테이블이 있으면 프로필 저장
    profile_data = {
        "id": str(user.id),
        "email": req.email,
        "name": req.name,
        "role": req.role,
        "employee_id": str(req.employee_id) if req.employee_id else None,
    }
    try:
        db.table("users").insert(profile_data).execute()
    except Exception:
        pass  # users 테이블 없어도 auth metadata로 동작

    meta = {
        "email": user.email,
        "name": req.name,
        "role": req.role,
        "employee_id": str(req.employee_id) if req.employee_id else None,
        "created_at": str(user.created_at) if user.created_at else "",
        "updated_at": str(user.updated_at) if user.updated_at else "",
    }

    return {
        "access_token": "",
        "user": {**profile_data, "is_active": True, "created_at": meta["created_at"], "updated_at": meta["updated_at"]},
    }


@router.get("/me", response_model=UserResponse)
async def get_me(authorization: str = Header(...)):
    """현재 로그인된 사용자 정보 조회"""
    token = authorization.replace("Bearer ", "")
    db = get_supabase()

    try:
        auth_res = db.auth.get_user(token)
    except Exception:
        raise HTTPException(401, "유효하지 않은 토큰입니다.")

    if not auth_res or not auth_res.user:
        raise HTTPException(401, "인증 정보를 확인할 수 없습니다.")

    user = auth_res.user
    meta = {
        "email": user.email,
        "created_at": str(user.created_at) if user.created_at else "",
        "updated_at": str(user.updated_at) if user.updated_at else "",
        **(user.user_metadata or {}),
    }

    return _get_user_profile(db, str(user.id), fallback_meta=meta)


@router.post("/logout")
async def logout():
    """로그아웃"""
    return {"message": "로그아웃되었습니다."}
