# worker

Async conversion worker (mock conversion for MVP wiring).

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

## Current behavior
- Reads pending messages from `backend/data/queue.json`.
- Writes mock GLB file to `backend/data/storage/glb/`.
- Updates model version status to `ready` in `backend/data/metadata.json`.
