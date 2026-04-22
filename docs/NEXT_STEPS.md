# Next Steps

## Current state
- [x] FastAPI/worker local flow works end-to-end.
- [x] Firestore metadata backend implemented and validated.
- [x] Firebase storage backend scaffold implemented (optional).
- [x] Local storage remains active MVP path for now.
- [x] Frontend MVP page implemented: upload + status polling + approve/reject + preview + thumbnail.
- [x] Firebase Authentication integrated (frontend login + backend token verification).
- [x] Role model scaffold added (`viewer/editor/reviewer/admin`) with route guards.
- [x] Utility script for Firebase custom claims added (`backend/scripts/set_firebase_role.py`).
- [x] Admin UI for users/roles is implemented and connected to backend admin endpoints.
- [x] Upload/conversion now supports `step/stp/iges/igs/3mf/stl/obj`.

## Next session priority
- [x] Set `CADRELAY_STORAGE_BACKEND=local` explicitly in `backend/.env` for stable no-cost setup.
- [x] Re-run full manual flow and verify artifacts:
  - upload status `processing`
  - worker result `processed`
  - final status `ready`
- [x] Add endpoint to list recent model versions (for simple UI table).
- [x] Add frontend `Sign up` flow (email/password) and default onboarding role behavior.
- [x] Add email verification flow:
  - send verification email after sign up
  - show verification status in UI
  - define which actions are blocked until email is verified
- [x] Define and implement admin-only endpoint(s) for role assignment (UI-safe replacement for direct script usage).

## Near-term roadmap
- [x] Replace file queue with Redis/SQS-style queue abstraction (still mock worker logic):
  - local queue backend works in MVP
  - redis/sqs adapters are scaffolded with explicit not-implemented error
- [x] Add download endpoint for original CAD and GLB by `model_version_id`.
- [x] Start minimal frontend page: upload + status polling + approve/reject.
- [x] Add admin UI page for role management:
  - show Firebase users and current roles
  - allow admin to assign/update roles (`viewer/editor/reviewer/admin`)
  - connect UI action to backend role assignment flow (currently `backend/scripts/set_firebase_role.py`)

## Cross-platform hardening
- [x] Add Linux-friendly run scripts and keep PowerShell equivalents.
- [x] Add CI smoke checks for backend startup and lint.
- [ ] Create GitHub repository and push current branch history.
- [ ] Enable GitHub Actions in remote repo and verify first CI run is green.

## Product/UI polish (after admin)
- [ ] Run dedicated frontend UI polish pass (design consistency + usability).
- [ ] Introduce shared design tokens (colors, spacing, typography, states).
- [ ] Improve model/version table UX (status chips, clearer actions, better layout hierarchy).
- [ ] Separate main areas into clearer screens/sections: Auth, Workspace, Admin.
- [ ] Add user collections in workspace:
  - liked models
  - favorites/saved models
- [ ] Add robust empty/error/loading states (no raw backend error text in final UX).
- [ ] Ensure responsive behavior for desktop/mobile and basic accessibility (focus states, keyboard navigation, labels).
- [ ] Add subtle motion for transitions/loading without impacting performance.
