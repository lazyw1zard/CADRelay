# MakeLayer

3D model exchange and web preview MVP with future-ready architecture.

MakeLayer is the public product name. `CADRelay` remains the repository and internal service codename during the MVP phase.

## Project structure
- docs/
- frontend/
- backend/
- worker/
- scripts/
- .github/workflows/

## Stack (MVP)
- Frontend: React + Vite + Three.js viewer
- Backend/API: FastAPI (Python)
- Worker: Python background service
- Metadata store: local JSON (MVP) / Firestore adapter
- Queue: local JSON backend + Redis/SQS abstraction scaffold
- File storage: local filesystem (MVP) / Firebase Storage adapter

## Quick start scripts
PowerShell:
```powershell
.\scripts\run_dev.ps1
.\scripts\run_backend.ps1
.\scripts\run_worker.ps1
```

Run local checks:
```powershell
.\scripts\check.ps1
```

Linux/macOS:
```bash
./scripts/run_backend.sh
./scripts/run_worker.sh
```

## CI
GitHub Actions workflow is configured in `.github/workflows/ci.yml`:
- backend: compileall + ruff + pytest
- frontend: `npm run build`
