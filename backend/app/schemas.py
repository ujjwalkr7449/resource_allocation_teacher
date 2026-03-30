from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class RegisterInput(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=6)
    role: Literal["teacher", "admin"] = "teacher"


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    full_name: str
    role: str


class ResourceRequestCreate(BaseModel):
    class_name: str = Field(min_length=1, max_length=50)
    room_number: str = Field(min_length=1, max_length=20)
    periods_needed: int = Field(gt=0, le=12)
    request_date: date
    start_time: time
    end_time: time
    reason: str = Field(min_length=5, max_length=500)


class ResourceRequestOut(BaseModel):
    id: int
    class_name: str
    room_number: str
    periods_needed: int
    request_date: date
    start_time: time
    end_time: time
    reason: str
    status: str
    created_at: datetime
    teacher_id: int
    teacher_name: str

    class Config:
        from_attributes = True


class RequestStatusUpdate(BaseModel):
    status: Literal["approved", "rejected"]


class ResourceAvailabilityItem(BaseModel):
    room_number: str
    request_date: date
    start_time: time
    end_time: time
    status: str
    teacher_name: str


class ResourceAvailabilityOut(BaseModel):
    room_number: str
    request_date: date
    is_available: bool
    bookings: list[ResourceAvailabilityItem]
