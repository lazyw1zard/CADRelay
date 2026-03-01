# backend

FastAPI service for metadata and workflow endpoints.

## Local run (PowerShell)

```powershell
cd C:\Projects\CADRelay\backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e .[dev]
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## Quick check
- `GET http://127.0.0.1:8000/health`
- `GET http://127.0.0.1:8000/docs`

## Notes
- Local MVP adapters write runtime data to `backend/data/`.
- This data directory is ignored by git and will be replaced with Firestore + object storage adapters later.
