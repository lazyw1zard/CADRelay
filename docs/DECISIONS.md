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
