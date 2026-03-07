# Next Steps

## Current state
- [x] FastAPI/worker local flow works end-to-end.
- [x] Firestore metadata backend implemented and validated.
- [x] Firebase storage backend scaffold implemented (optional).
- [x] Local storage remains active MVP path for now.

## Next session priority
- [ ] Set `CADRELAY_STORAGE_BACKEND=local` explicitly in `backend/.env` for stable no-cost setup.
- [ ] Re-run full manual flow and verify artifacts:
  - upload status `processing`
  - worker result `processed`
  - final status `ready`
- [ ] Add endpoint to list recent model versions (for simple UI table).

## Near-term roadmap
- [ ] Replace file queue with Redis/SQS-style queue abstraction (still mock worker logic).
- [ ] Add download endpoint for original CAD and GLB by `model_version_id`.
- [ ] Start minimal frontend page: upload + status polling + approve/reject.

## Cross-platform hardening
- [ ] Add Linux-friendly run scripts and keep PowerShell equivalents.
- [ ] Add CI smoke checks for backend startup and lint.
