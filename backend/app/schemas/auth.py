from pydantic import BaseModel, EmailStr
from uuid import UUID
from datetime import datetime

EMAIL_DOMAIN = "kt-field.com"


def username_to_email(username: str) -> str:
    """아이디를 Supabase Auth용 이메일로 변환"""
    if "@" in username:
        return username
    return f"{username}@{EMAIL_DOMAIN}"


class LoginRequest(BaseModel):
    username: str
    password: str


class SignUpRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = "employee"
    employee_id: UUID | None = None


class UserResponse(BaseModel):
    id: UUID
    email: str
    name: str
    role: str
    employee_id: UUID | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    access_token: str
    user: UserResponse
