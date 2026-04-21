# worker

Async conversion worker for CADRelay MVP.

## Local run

Process one message and exit:
```powershell
cd C:\Projects\CADRelay
C:\Projects\CADRelay\backend\.venv\Scripts\python.exe .\worker\app\main.py --once
```

Run polling loop:
```powershell
cd C:\Projects\CADRelay
C:\Projects\CADRelay\backend\.venv\Scripts\python.exe .\worker\app\main.py
```

Show queue stats:
```powershell
cd C:\Projects\CADRelay
C:\Projects\CADRelay\backend\.venv\Scripts\python.exe .\worker\app\main.py --queue-stats --error-limit 10
```

Prune old queue history:
```powershell
cd C:\Projects\CADRelay
C:\Projects\CADRelay\backend\.venv\Scripts\python.exe .\worker\app\main.py --queue-prune --prune-keep-days 7
```

## Current behavior
- Reads pending messages from `backend/data/queue.json`.
- Loads original CAD bytes from active storage backend (`local` or `firebase`).
- Converts CAD (`step/stp/iges/igs`) to mesh using `gmsh` and exports GLB via `trimesh`.
- Converts `3mf` directly via `trimesh` (without gmsh meshing stage).
- Converts `stl` directly via `trimesh` (without gmsh meshing stage).
- Saves GLB to storage and updates model version status to `ready`.
- On conversion error updates status to `failed` and stores error in queue message.
- In `--queue-stats` mode prints counts and recent failed errors.
- In `--queue-prune` mode removes old `processed/failed` messages.
