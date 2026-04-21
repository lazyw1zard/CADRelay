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
- By default backend auto-triggers one worker run after each upload.
- To disable this behavior set `CADRELAY_AUTO_WORKER_ENABLED=false` in `backend/.env`.
- Supported upload formats: `step`, `stp`, `iges`, `igs`, `3mf`, `stl`, `obj`.
- Queue backend is selected via `CADRELAY_QUEUE_BACKEND` (`local` by default).

## Firestore mode
By default metadata backend is `local`.
For Firestore backend, `backend/.env` is required.

Example `backend/.env`:

```env
CADRELAY_METADATA_BACKEND=firestore
CADRELAY_STORAGE_BACKEND=local
CADRELAY_QUEUE_BACKEND=local
CADRELAY_AUTO_WORKER_ENABLED=true
FIREBASE_PROJECT_ID=cad-relay
FIREBASE_STORAGE_BUCKET=<your-firebase-storage-bucket>
GOOGLE_APPLICATION_CREDENTIALS=C:/Projects/conf_path/cad-relay-firebase-adminsdk-fbsvc-74a9ebbd37.json
```

Then run server normally:

```powershell
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Queue backend modes:
- `local`: fully working in MVP (`backend/data/queue.json`).
- `redis` / `sqs`: scaffold only for now (API raises explicit "not implemented in MVP yet").

## Auth mode (MVP)
By default auth is disabled (`CADRELAY_AUTH_MODE=disabled`) to keep local flow simple.

To enable Firebase token verification:

```env
CADRELAY_AUTH_MODE=firebase
FIREBASE_AUTH_CREDENTIALS=C:/Projects/conf_path/cad-relay-firebase-adminsdk-fbsvc-74a9ebbd37.json
```

Notes:
- API expects `Authorization: Bearer <firebase_id_token>` when firebase auth mode is enabled.
- `owner_user_id` for uploaded models is taken from token `uid` in firebase mode.
- Non-admin user can access only own model versions.
- Write actions require verified email (`email_verified=true` in Firebase token claims).

## Role policy (MVP)
Roles are read from Firebase custom claims (`role`).
If claim is missing, backend defaults role to `editor` for MVP speed.

Allowed roles:
- `viewer`: list/get/download own model versions.
- `editor`: viewer + upload/create/delete own model versions.
- `reviewer`: viewer + approve/reject own model versions.
- `admin`: full access to all model versions.

### Set role in Firebase custom claims
Use backend utility script:

```powershell
cd C:\Projects\CADRelay\backend
.\.venv\Scripts\Activate.ps1
python .\scripts\set_firebase_role.py --uid <FIREBASE_UID> --role editor --credentials C:/Projects/conf_path/cad-relay-firebase-adminsdk-fbsvc-74a9ebbd37.json
```

After changing claims, user should sign out/sign in to refresh token.

### Admin API for role management
These endpoints are backend-side replacement for manual script usage and are intended for future admin UI.

- `GET /api/v1/admin/users?limit=50&page_token=...`
  - lists Firebase Auth users with resolved app role
  - available only for `admin` role
- `POST /api/v1/admin/users/{uid}/role`
  - body: `{ "role": "viewer|editor|reviewer|admin" }`
  - updates Firebase custom claims for target user
  - available only for `admin` role
