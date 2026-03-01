# API Draft (MVP)

Base path: `/api/v1`

## Endpoints

### `POST /uploads`
Upload source CAD file and enqueue conversion task.

Content type: `multipart/form-data`

Fields:
- `model_id` (string)
- `source_format` (string: `step|stp|iges|igs`)
- `file` (binary)

Response body:
```json
{
  "model_version": {
    "id": "mv_ad2ff1f5d564",
    "model_id": "model_demo_001",
    "source_format": "step",
    "status": "processing",
    "storage_key_original": "originals/mv_ad2ff1f5d564_sample.step",
    "storage_key_glb": null,
    "checksum": "...",
    "size_bytes": 44
  },
  "queue_message_id": "msg_65c474a705a2"
}
```

### `GET /model-versions/{id}`
Read model version status and storage keys.

### `POST /model-versions`
Create model version metadata record without upload (service/testing endpoint).

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
