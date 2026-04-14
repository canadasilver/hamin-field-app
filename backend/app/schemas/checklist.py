from pydantic import BaseModel
from datetime import datetime
from uuid import UUID


class ChecklistCreate(BaseModel):
    schedule_id: UUID


class ChecklistUpdate(BaseModel):
    item_1: bool | None = None
    item_2: bool | None = None
    item_3: bool | None = None
    item_4: bool | None = None
    item_5: bool | None = None
    notes: str | None = None
    photo_urls: list[str] | None = None


class ChecklistResponse(BaseModel):
    id: UUID
    schedule_id: UUID
    item_1: bool
    item_1_label: str
    item_2: bool
    item_2_label: str
    item_3: bool
    item_3_label: str
    item_4: bool
    item_4_label: str
    item_5: bool
    item_5_label: str
    notes: str | None
    photo_urls: list[str] | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
