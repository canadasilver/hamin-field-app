from pydantic import BaseModel
from datetime import datetime
from uuid import UUID


class StationResponse(BaseModel):
    id: UUID
    file_id: UUID | None = None
    no: int | None = None
    unique_no: str | None = None
    network_group: str | None = None
    location_code: str | None = None
    equipment_type: str | None = None
    station_id: str | None = None
    station_name: str
    indoor_outdoor: str | None = None
    operation_count: int | None = None
    cooling_info: list | None = None
    barcode: str | None = None
    work_2021: str | None = None
    work_2022: str | None = None
    work_2023: str | None = None
    work_2024: str | None = None
    work_2025: str | None = None
    defect: str | None = None
    operation_team: str | None = None
    manager: str | None = None
    contact: str | None = None
    address: str | None = None
    building_name: str | None = None
    planned_process: str | None = None
    inspector: str | None = None
    inspection_target: str | None = None
    inspection_result: str | None = None
    inspection_date: str | None = None
    registration_status: str | None = None
    registration_date: str | None = None
    lat: float | None = None
    lng: float | None = None
    status: str = "pending"
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class UploadedFileResponse(BaseModel):
    id: UUID
    filename: str
    upload_date: datetime
    total_count: int
    uploaded_by: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True
