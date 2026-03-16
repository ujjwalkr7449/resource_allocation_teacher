from fastapi import Depends, FastAPI, HTTPException
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
    RegisterInput,
    RequestStatusUpdate,
    ResourceRequestCreate,
    ResourceRequestOut,
    TokenResponse,
)

Base.metadata.create_all(bind=engine)

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

    request.status = payload.status
    db.commit()
    db.refresh(request)
    return serialize_request(request)
