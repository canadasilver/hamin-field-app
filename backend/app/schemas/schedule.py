from pydantic import BaseModel
from datetime import date, datetime
from uuid import UUID


class ScheduleCreate(BaseModel):
    station_id: UUID
    employee_id: UUID
    scheduled_date: date
    sort_order: int = 0


class ScheduleUpdate(BaseModel):
    status: str | None = None
    sort_order: int | None = None
    postponed_to: date | None = None


class ScheduleResponse(BaseModel):
    id: UUID
    station_id: UUID
    employee_id: UUID
    scheduled_date: date
    sort_order: int
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    postponed_to: date | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ScheduleWithStation(ScheduleResponse):
    station_name: str | None = None
    station_address: str | None = None
    station_lat: float | None = None
    station_lng: float | None = None
    work_description: str | None = None
