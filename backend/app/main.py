from datetime import date, time

from fastapi import Depends, FastAPI, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .auth import (
    create_access_token,
    get_current_user,
    hash_password,
    require_admin,
    require_teacher,
    verify_password,
)
from .database import Base, engine, get_db
from .models import ResourceRequest, User
from .schemas import (
    LoginInput,
    ResourceAvailabilityItem,
    ResourceAvailabilityOut,
    RegisterInput,
    RequestStatusUpdate,
    ResourceRequestCreate,
    ResourceRequestOut,
    TokenResponse,
)

Base.metadata.create_all(bind=engine)


def ensure_sqlite_columns() -> None:
    if engine.dialect.name != "sqlite":
        return

    required_columns = {
        "request_date": "DATE",
        "start_time": "TIME",
        "end_time": "TIME",
    }
    with engine.begin() as connection:
        current_columns_raw = connection.execute(text("PRAGMA table_info(resource_requests)")).fetchall()
        current_columns = {row[1] for row in current_columns_raw}
        for column_name, column_type in required_columns.items():
            if column_name in current_columns:
                continue
            try:
                connection.execute(
                    text(f"ALTER TABLE resource_requests ADD COLUMN {column_name} {column_type}")
                )
            except OperationalError:
                continue


ensure_sqlite_columns()

app = FastAPI(title="Teacher Resource Allocation")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def serialize_request(item: ResourceRequest) -> ResourceRequestOut:
    return ResourceRequestOut(
        id=item.id,
        class_name=item.class_name,
        room_number=item.room_number,
        periods_needed=item.periods_needed,
        request_date=item.request_date,
        start_time=item.start_time,
        end_time=item.end_time,
        reason=item.reason,
        status=item.status,
        created_at=item.created_at,
        teacher_id=item.teacher_id,
        teacher_name=item.teacher.full_name,
    )

@app.post("/auth/register", response_model=TokenResponse)
def register(payload: RegisterInput, db: Session = Depends(get_db)):
    exists = db.query(User).filter(User.email == payload.email).first()
    if exists:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        full_name=payload.full_name,
        email=payload.email,
        role=payload.role,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token, full_name=user.full_name, role=user.role)


@app.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginInput, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid email or password")

    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token, full_name=user.full_name, role=user.role)


@app.get("/auth/me", response_model=TokenResponse)
def me(user: User = Depends(get_current_user)):
    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token, full_name=user.full_name, role=user.role)


@app.post("/requests", response_model=ResourceRequestOut)
def create_request(
    payload: ResourceRequestCreate,
    user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    if payload.end_time <= payload.start_time:
        raise HTTPException(status_code=400, detail="End time must be later than start time")

    approved_conflict = (
        db.query(ResourceRequest)
        .filter(
            ResourceRequest.room_number == payload.room_number,
            ResourceRequest.request_date == payload.request_date,
            ResourceRequest.status == "approved",
            ResourceRequest.start_time < payload.end_time,
            ResourceRequest.end_time > payload.start_time,
        )
        .first()
    )
    if approved_conflict is not None:
        raise HTTPException(status_code=400, detail="Resource is already assigned for this time period")

    request = ResourceRequest(**payload.model_dump(), teacher_id=user.id)
    db.add(request)
    db.commit()
    db.refresh(request)
    return serialize_request(request)


@app.get("/requests/my", response_model=list[ResourceRequestOut])
def my_requests(
    status: str | None = None,
    user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    query = db.query(ResourceRequest).filter(ResourceRequest.teacher_id == user.id)
    if status:
        query = query.filter(ResourceRequest.status == status)
    items = query.order_by(ResourceRequest.created_at.desc()).all()
    return [serialize_request(item) for item in items]


@app.get("/admin/requests", response_model=list[ResourceRequestOut])
def list_all_requests(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    _ = user
    items = db.query(ResourceRequest).order_by(ResourceRequest.created_at.desc()).all()
    return [serialize_request(item) for item in items]


@app.get("/resources/schedule", response_model=list[ResourceAvailabilityOut])
def resource_schedule(
    request_date: date = Query(...),
    room_number: str | None = Query(None),
    start_time: time | None = Query(None),
    end_time: time | None = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ = user
    if (start_time and not end_time) or (end_time and not start_time):
        raise HTTPException(status_code=400, detail="Provide both start_time and end_time to filter by time slot")
    if start_time and end_time and end_time <= start_time:
        raise HTTPException(status_code=400, detail="end_time must be later than start_time")

    query = db.query(ResourceRequest).filter(ResourceRequest.request_date == request_date)
    if room_number:
        clean_room = room_number.strip()
        query = query.filter(ResourceRequest.room_number.ilike(f"%{clean_room}%"))
    items = query.order_by(ResourceRequest.room_number.asc(), ResourceRequest.start_time.asc()).all()

    grouped: dict[str, list[ResourceRequest]] = {}
    for item in items:
        grouped.setdefault(item.room_number, []).append(item)

    response: list[ResourceAvailabilityOut] = []
    for room, room_items in grouped.items():
        approved_overlap_exists = False
        if start_time and end_time:
            approved_overlap_exists = any(
                entry.status == "approved" and entry.start_time < end_time and entry.end_time > start_time
                for entry in room_items
            )
        bookings = [
            ResourceAvailabilityItem(
                room_number=room,
                request_date=request_date,
                start_time=entry.start_time,
                end_time=entry.end_time,
                status=entry.status,
                teacher_name=entry.teacher.full_name,
            )
            for entry in room_items
            if not start_time or (entry.start_time < end_time and entry.end_time > start_time)
        ]
        response.append(
            ResourceAvailabilityOut(
                room_number=room,
                request_date=request_date,
                is_available=not approved_overlap_exists
                if start_time and end_time
                else not any(entry.status == "approved" for entry in room_items),
                bookings=bookings,
            )
        )

    if room_number and not response:
        response.append(
            ResourceAvailabilityOut(
                room_number=room_number.strip(),
                request_date=request_date,
                is_available=True,
                bookings=[],
            )
        )
    return response


@app.patch("/admin/requests/{request_id}", response_model=ResourceRequestOut)
def update_request_status(
    request_id: int,
    payload: RequestStatusUpdate,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    _ = user
    request = db.query(ResourceRequest).filter(ResourceRequest.id == request_id).first()
    if request is None:
        raise HTTPException(status_code=404, detail="Request not found")

    if payload.status == "approved":
        approved_conflict = (
            db.query(ResourceRequest)
            .filter(
                ResourceRequest.id != request.id,
                ResourceRequest.room_number == request.room_number,
                ResourceRequest.request_date == request.request_date,
                ResourceRequest.status == "approved",
                ResourceRequest.start_time < request.end_time,
                ResourceRequest.end_time > request.start_time,
            )
            .first()
        )
        if approved_conflict is not None:
            raise HTTPException(
                status_code=400,
                detail="Cannot approve because this resource is already assigned for the same time period",
            )

    request.status = payload.status
    db.commit()
    db.refresh(request)
    return serialize_request(request)
