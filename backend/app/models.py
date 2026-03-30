from datetime import date, datetime, time

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(120), unique=True, nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="teacher")
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)

    requests: Mapped[list["ResourceRequest"]] = relationship(back_populates="teacher")


class ResourceRequest(Base):
    __tablename__ = "resource_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    class_name: Mapped[str] = mapped_column(String(50), nullable=False)
    room_number: Mapped[str] = mapped_column(String(20), nullable=False)
    periods_needed: Mapped[int] = mapped_column(Integer, nullable=False)
    request_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    teacher: Mapped[User] = relationship(back_populates="requests")
