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

## Firestore mode
By default metadata backend is `local`.
For Firestore backend, `backend/.env` is required.

Example `backend/.env`:

```env
CADRELAY_METADATA_BACKEND=firestore
CADRELAY_STORAGE_BACKEND=firebase
FIREBASE_PROJECT_ID=cad-relay
FIREBASE_STORAGE_BUCKET=<your-firebase-storage-bucket>
GOOGLE_APPLICATION_CREDENTIALS=C:/Projects/conf_path/cad-relay-firebase-adminsdk-fbsvc-74a9ebbd37.json
```

Then run server normally:

```powershell
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
