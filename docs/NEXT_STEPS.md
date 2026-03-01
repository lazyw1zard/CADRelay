# Next Steps

## Immediate (now)
- [x] Create and activate `backend/.venv` with Python 3.12.
- [x] Install backend dependencies and run FastAPI locally.
- [x] Validate endpoints:
  - `GET /health`
  - OpenAPI UI at `/docs`

## Vertical slice #1 (local-only)
- [x] Implement upload endpoint (local storage adapter + local metadata adapter).
- [x] Create conversion task contract (`conversion_requested`).
- [x] Implement worker mock processing (`uploaded -> processing -> ready`).
- [x] Verify end-to-end flow with one STEP sample.

## Vertical slice #2 (cloud-backed)
- [ ] Add Firestore metadata adapter.
- [ ] Add object storage adapter.
- [ ] Keep domain services unchanged via repository interfaces.

## Cross-platform hardening
- [x] Add settings module with env-driven config (no hardcoded local paths).
- [ ] Add Linux-friendly run scripts and keep PowerShell equivalents.
- [ ] Add CI smoke checks for backend startup and lint.
