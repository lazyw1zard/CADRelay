# backend

FastAPI service for metadata and workflow endpoints.

## Local run

```bash
python -m venv .venv
. .venv/Scripts/activate
pip install -e .[dev]
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
