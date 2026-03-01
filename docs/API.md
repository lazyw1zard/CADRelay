# API Draft (MVP)

Base path: `/api/v1`

## Endpoints

### `POST /model-versions`
Create model version metadata record right after upload.

Request body:
```json
{
  "model_id": "model_001",
  "source_format": "step"
}
```

Response body:
```json
{
  "id": "mv_mock_001",
  "model_id": "model_001",
  "source_format": "step",
  "status": "uploaded"
}
```

### `POST /model-versions/{id}/approval`
Save approve/reject decision for model version.

Request body:
```json
{
  "decision": "approve",
  "comment": "Looks good"
}
```

### `GET /health`
Health check endpoint.
