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
- [x] For `3mf`, embedded thumbnail is auto-extracted on upload when user thumbnail is not provided.

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
- [ ] Expand embedded thumbnail extraction beyond `3mf` (where source format provides preview metadata/assets).
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
- [x] Run dedicated frontend UI polish pass (design consistency + usability).
- [x] Introduce shared design tokens (colors, spacing, typography, states).
- [x] Improve model/version table UX (status chips, clearer actions, better layout hierarchy).
- [x] Separate main areas into clearer screens/sections: Auth, Workspace, Admin.
- [x] Add local MVP favorites in workspace:
  - saved models are stored in `localStorage` by Firebase UID
  - favorites are visible in Workspace
- [x] Add backend-backed user collections:
  - liked models
  - favorites/saved models across devices
- [ ] Add like counters and public saved/like aggregates after saved model relations settle.
- [x] Add managed model categories:
  - admin-managed category list
  - category dropdown during upload instead of free text
  - category filters in Explore
- [ ] Add category ordering and richer taxonomy:
  - admin sort order controls
  - optional icons/descriptions
  - edit-category flow for existing models
- [ ] Add robust empty/error/loading states (no raw backend error text in final UX).
- [ ] Ensure responsive behavior for desktop/mobile and basic accessibility (focus states, keyboard navigation, labels).
- [x] Add subtle motion for transitions/loading without impacting performance.
- [x] Add render viewer toolbar:
  - fit/reset camera
  - view presets
  - grid/axes toggles
  - wireframe mode
  - fullscreen and screenshot
- [x] Add render viewer layer 2 MVP tools:
  - light/dark background toggle
  - bounding box and dimensions readout
  - two-point distance measurement
  - lightweight lighting presets (`studio/technical/contrast/flat`)
  - sketch/edge-only inspection mode for cleaner measuring
  - orthographic 2D views for selected base planes (`front/right/top`)

## Deferred ideas
- [ ] Render viewer advanced controls:
  - section/clipping plane for inspecting internals, wall thickness and hidden cavities
  - true 2D section extraction from an arbitrary selected plane
  - exportable sketch extraction from model/section to SVG/DXF
  - material modes (`original/clay/normal`) after performance check on heavier GLB files
  - optional lighting advanced panel (`intensity`, `direction`, `exposure`)
  - model-unit calibration and explicit units (`mm/inch/model units`)
  - persistent per-user viewer preferences after backend-backed user settings exist
- [ ] Public/user profile improvements:
  - mini-profile popover from author name
  - author rating, uploaded model count and status
  - display name availability/validation rules
