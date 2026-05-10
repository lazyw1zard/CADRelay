# Decisions (ADR-lite)

## 2026-03-01

### D-001: Product codename
- Decision: use `CADRelay` as working codename for MVP.
- Rationale: good internal name, low setup friction.
- Consequence: public naming/trademark check will be done before external launch.

### D-002: Architecture style
- Decision: hybrid architecture (web viewer + backend API + async worker).
- Rationale: supports upload/review workflow now and scales to heavier conversion later.

### D-003: Tech stack (MVP)
- Decision: Python/FastAPI for backend and worker, React for frontend.
- Rationale: easier CAD/conversion integration and stronger team familiarity with Python.

### D-004: Exchange format strategy
- Decision: STEP as main supported input for conversion; store original CAD as-is.
- Rationale: cross-CAD compatibility (SolidWorks/Fusion/FreeCAD/KOMPAS export path).

### D-005: Data/storage strategy (MVP)
- Decision: Firestore for metadata (MVP phase), object storage for file binaries.
- Rationale: quick delivery for MVP while preserving migration path.

### D-006: Growth path
- Decision: keep repository/service interfaces DB-agnostic to allow Firestore -> PostgreSQL migration.
- Rationale: avoid lock-in and reduce rewrite risk when workload grows.

### D-007: Delivery approach
- Decision: implement vertical slices (run server -> health/docs -> upload flow -> queue/worker).
- Rationale: end-to-end visibility and easier debugging.

### D-008: Metadata backend implementation
- Decision: implement switchable metadata backend (`local` | `firestore`) via env.
- Rationale: keep local development simple and allow real cloud persistence when needed.
- Consequence: current recommended setup is Firestore for metadata.

### D-009: Storage backend strategy
- Decision: implement switchable storage backend (`local` | `firebase`) and keep `local` as active default for MVP.
- Rationale: Firebase Storage currently requires billing; project needs no-cost path.
- Consequence: use local file storage now, enable cloud storage later without API rewrites.

## 2026-05-10

### D-010: Public product name
- Decision: use `MakeLayer` as the public product/domain name.
- Rationale: better fit for a model-sharing and 3D-printing-adjacent product; domain `makelayer.org` is active.
- Consequence: visible UI/docs use MakeLayer, while repository paths, env prefixes and package names keep `CADRelay` until a deliberate internal rename.

### D-011: Postgres auth migration path
- Decision: add `CADRELAY_AUTH_MODE=postgres` beside existing Firebase/disabled modes.
- Rationale: move user identity and roles into the self-hosted Postgres stack before public data accumulates.
- Consequence: MakeLayer production uses Postgres auth; Firebase stays available only by explicit `VITE_AUTH_MODE=firebase` opt-in during transition.
