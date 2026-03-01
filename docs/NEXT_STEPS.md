# Next Steps

## Immediate (now)
- [ ] Create and activate `backend/.venv` with Python 3.11.
- [ ] Install backend dependencies and run FastAPI locally.
- [ ] Validate endpoints:
  - `GET /health`
  - OpenAPI UI at `/docs`

## Vertical slice #1 (local-only)
- [ ] Implement upload endpoint (local storage adapter + in-memory metadata adapter).
- [ ] Create conversion task contract (`conversion_requested`).
- [ ] Implement worker mock processing (`uploaded -> processing -> ready/failed`).
- [ ] Verify end-to-end flow with one STEP sample.

## Vertical slice #2 (cloud-backed)
- [ ] Add Firestore metadata adapter.
- [ ] Add object storage adapter.
- [ ] Keep domain services unchanged via repository interfaces.

## Cross-platform hardening
- [ ] Add settings module with env-driven config (no hardcoded local paths).
- [ ] Add Linux-friendly run scripts and keep PowerShell equivalents.
- [ ] Add CI smoke checks for backend startup and lint.
