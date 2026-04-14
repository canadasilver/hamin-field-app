from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.api.deps import get_supabase
from app.schemas.employee import (
    EmployeeCreate,
    EmployeeUpdate,
    EmployeeResponse,
    UnavailableDateCreate,
    UnavailableDateResponse,
)
from app.schemas.auth import username_to_email
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/employees", tags=["직원"])


@router.get("/", response_model=list[EmployeeResponse])
async def list_employees(active_only: bool = True):
    """직원 목록 조회"""
    db = get_supabase()
    query = db.table("employees").select("*").order("name")
    if active_only:
        query = query.eq("is_active", True)
    result = query.execute()
    return result.data


@router.post("/", response_model=EmployeeResponse)
async def create_employee(employee: EmployeeCreate):
    """직원 등록 + 로그인 계정 생성"""
    db = get_supabase()

    # 아이디 중복 체크
    existing = (
        db.table("employees")
        .select("id")
        .eq("username", employee.username)
        .execute()
    )
    if existing.data:
        raise HTTPException(400, "이미 사용 중인 아이디입니다.")

    # 1. employees 테이블에 저장 (password 제외)
    emp_data = employee.model_dump(exclude={"password"})
    try:
        result = db.table("employees").insert(emp_data).execute()
    except Exception as e:
        raise HTTPException(500, f"직원 등록 실패: {str(e)}")
    if not result.data:
        raise HTTPException(500, "직원 등록에 실패했습니다.")

    emp = result.data[0]

    # 2. Supabase Auth 계정 생성 (username@kt-field.com)
    email = username_to_email(employee.username)
    try:
        auth_res = db.auth.admin.create_user({
            "email": email,
            "password": employee.password,
            "email_confirm": True,
            "user_metadata": {
                "name": employee.name,
                "role": "employee",
                "employee_id": emp["id"],
            },
        })

        # 3. users 프로필 테이블 저장
        if auth_res.user:
            try:
                db.table("users").insert({
                    "id": str(auth_res.user.id),
                    "email": email,
                    "name": employee.name,
                    "role": "employee",
                    "employee_id": emp["id"],
                }).execute()
            except Exception:
                pass
    except Exception as e:
        logger.warning(f"Auth 계정 생성 실패: {e}")

    return emp


@router.patch("/{employee_id}", response_model=EmployeeResponse)
async def update_employee(employee_id: str, employee: EmployeeUpdate):
    """직원 정보 수정"""
    db = get_supabase()
    update_data = employee.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(400, "수정할 항목이 없습니다.")
    result = (
        db.table("employees").update(update_data).eq("id", employee_id).execute()
    )
    if not result.data:
        raise HTTPException(404, "직원을 찾을 수 없습니다.")
    return result.data[0]


@router.delete("/{employee_id}")
async def delete_employee(employee_id: str):
    """직원 삭제 (비활성화)"""
    db = get_supabase()
    db.table("employees").update({"is_active": False}).eq("id", employee_id).execute()
    return {"message": "비활성화되었습니다."}


# --- 계정 정보 ---


@router.get("/{employee_id}/account")
async def get_employee_account(employee_id: str):
    """직원의 연결된 로그인 계정 조회"""
    db = get_supabase()

    # employees 테이블에서 username 조회
    try:
        emp = db.table("employees").select("username").eq("id", employee_id).execute()
        if emp.data and emp.data[0].get("username"):
            return {"username": emp.data[0]["username"], "has_account": True}
    except Exception:
        pass

    # users 테이블에서 조회 (하위 호환)
    try:
        result = db.table("users").select("email").eq("employee_id", employee_id).execute()
        if result.data:
            return {"username": result.data[0]["email"], "has_account": True}
    except Exception:
        pass

    return {"username": None, "has_account": False}


class CreateAccountRequest(BaseModel):
    username: str
    password: str


@router.post("/{employee_id}/create-account")
async def create_employee_account(employee_id: str, req: CreateAccountRequest):
    """기존 직원에 로그인 계정 생성"""
    if len(req.password) < 4:
        raise HTTPException(400, "비밀번호는 4자리 이상이어야 합니다.")
    if not req.username.strip():
        raise HTTPException(400, "아이디를 입력하세요.")

    db = get_supabase()

    # 직원 존재 확인
    emp_res = db.table("employees").select("id, name, username").eq("id", employee_id).execute()
    if not emp_res.data:
        raise HTTPException(404, "직원을 찾을 수 없습니다.")
    emp = emp_res.data[0]

    if emp.get("username"):
        raise HTTPException(400, "이미 계정이 존재합니다.")

    # 아이디 중복 체크
    existing = db.table("employees").select("id").eq("username", req.username.strip()).execute()
    if existing.data:
        raise HTTPException(400, "이미 사용 중인 아이디입니다.")

    # Supabase Auth 계정 생성
    email = username_to_email(req.username.strip())
    try:
        auth_res = db.auth.admin.create_user({
            "email": email,
            "password": req.password,
            "email_confirm": True,
            "user_metadata": {
                "name": emp["name"],
                "role": "employee",
                "employee_id": employee_id,
            },
        })
    except Exception as e:
        raise HTTPException(500, f"Auth 계정 생성 실패: {str(e)}")

    # employees 테이블 username 업데이트
    db.table("employees").update({"username": req.username.strip()}).eq("id", employee_id).execute()

    # users 프로필 테이블 저장
    if auth_res.user:
        try:
            db.table("users").insert({
                "id": str(auth_res.user.id),
                "email": email,
                "name": emp["name"],
                "role": "employee",
                "employee_id": employee_id,
            }).execute()
        except Exception:
            pass

    return {"message": "계정이 생성되었습니다.", "username": req.username.strip()}


class ResetPasswordRequest(BaseModel):
    new_password: str


@router.post("/{employee_id}/reset-password")
async def reset_employee_password(employee_id: str, req: ResetPasswordRequest):
    """직원 비밀번호 재설정"""
    if len(req.new_password) < 4:
        raise HTTPException(400, "비밀번호는 4자리 이상이어야 합니다.")

    db = get_supabase()
    auth_user_id = None

    # users 테이블에서 auth user id 조회
    try:
        result = db.table("users").select("id").eq("employee_id", employee_id).execute()
        if result.data:
            auth_user_id = result.data[0]["id"]
    except Exception:
        pass

    # auth admin API로 조회
    if not auth_user_id:
        try:
            users_res = db.auth.admin.list_users()
            for u in users_res:
                meta = getattr(u, 'user_metadata', None) or {}
                if meta.get("employee_id") == employee_id:
                    auth_user_id = str(u.id)
                    break
        except Exception as e:
            raise HTTPException(500, f"Auth 사용자 조회 실패: {str(e)}")

    if not auth_user_id:
        raise HTTPException(404, "연결된 로그인 계정이 없습니다.")

    try:
        db.auth.admin.update_user_by_id(auth_user_id, {"password": req.new_password})
    except Exception as e:
        raise HTTPException(500, f"비밀번호 변경 실패: {str(e)}")

    return {"message": "비밀번호가 변경되었습니다."}


# --- 근무불가 날짜 ---


@router.get("/{employee_id}/unavailable-dates", response_model=list[UnavailableDateResponse])
async def list_unavailable_dates(employee_id: str):
    """근무불가 날짜 조회"""
    db = get_supabase()
    result = (
        db.table("employee_unavailable_dates")
        .select("*")
        .eq("employee_id", employee_id)
        .order("unavailable_date")
        .execute()
    )
    return result.data


@router.post("/{employee_id}/unavailable-dates", response_model=UnavailableDateResponse)
async def add_unavailable_date(employee_id: str, data: UnavailableDateCreate):
    """근무불가 날짜 추가"""
    db = get_supabase()
    result = (
        db.table("employee_unavailable_dates")
        .insert({
            "employee_id": employee_id,
            "unavailable_date": data.unavailable_date.isoformat(),
            "reason": data.reason,
        })
        .execute()
    )
    return result.data[0]


@router.delete("/{employee_id}/unavailable-dates/{date_id}")
async def remove_unavailable_date(employee_id: str, date_id: str):
    """근무불가 날짜 삭제"""
    db = get_supabase()
    db.table("employee_unavailable_dates").delete().eq("id", date_id).execute()
    return {"message": "삭제되었습니다."}
