# Teacher Resource Allocation System

This project provides:
- **Teacher panel**: raise a ticket with class name/section, room number, number of periods, and reason.
- **Admin panel**: view all teacher tickets with teacher names and approve/reject requests.
- **Authentication**: role-based login for teacher/admin using JWT.

## Tech Stack
- Frontend: React.js (Vite)
- Backend: FastAPI
- ORM/DB: SQLAlchemy + SQLite

## Backend setup
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```
Backend runs on `http://127.0.0.1:8000`.

## Frontend setup
```bash
cd frontend
npm install
npm run dev
```
Frontend runs on `http://127.0.0.1:5173`.

## Workflow
1. Register/login as **teacher** and create a resource request ticket.
2. Register/login as **admin** and open admin panel to approve/reject tickets.
3. Teachers only see their own tickets after logging in.
