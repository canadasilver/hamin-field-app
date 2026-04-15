from pydantic import BaseModel
from datetime import date, datetime
from uuid import UUID


class EmployeeBase(BaseModel):
    name: str
    contact: str
    max_daily_tasks: int = 5
    per_task_rate: int = 0
    resident_number: str | None = None
    vehicle_number: str | None = None
    memo: str | None = None


class EmployeeCreate(EmployeeBase):
    username: str
    password: str


class EmployeeUpdate(BaseModel):
    name: str | None = None
    contact: str | None = None
    max_daily_tasks: int | None = None
    per_task_rate: int | None = None
    is_active: bool | None = None
    resident_number: str | None = None
    vehicle_number: str | None = None
    memo: str | None = None


class EmployeeResponse(EmployeeBase):
    id: UUID
    username: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UnavailableDateCreate(BaseModel):
    unavailable_date: date
    reason: str | None = None


class UnavailableDateResponse(BaseModel):
    id: UUID
    employee_id: UUID
    unavailable_date: date
    reason: str | None

    class Config:
        from_attributes = True
