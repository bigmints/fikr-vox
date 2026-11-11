# Fikr Vox worker API v1

Fikr Vox uses this HTTP API to discover remote engines, upload reference media, and track jobs. The [InfiniteTalk adapter](../worker/) is historical. The app rejects new InfiniteTalk submissions and marks unfinished InfiniteTalk jobs as failed.

When a connection token is configured, the client sends `Authorization: Bearer <token>`. Serve the API over HTTPS outside a trusted network. Use `application/json` for JSON responses and return errors as `{"error":"message"}` with the appropriate HTTP status.

## Discover engines

`GET /v1/capabilities` returns the API version and available engines.

```json
{
  "apiVersion": 1,
  "engines": [
    { "id": "chatterbox", "name": "Chatterbox", "kind": "voice", "ready": true }
  ]
}
```

Set `ready` to `true` when the engine can accept work. Validate language, media format, duration, and resource limits before accepting jobs.

## Upload reference media

Send raw media bytes to `POST /v1/assets` with these headers.

| Header | Value |
| --- | --- |
| `Content-Type` | Media type of the upload |
| `X-Filename` | URL-encoded filename |
| `Idempotency-Key` | Local asset ID |

Return `{"id":"worker-asset-id"}`. A repeated upload with the same key returns the original asset ID.

## Submit a job

Send a JSON payload to `POST /v1/jobs`. The `Idempotency-Key` header and `clientJobId` both carry the local job ID. Values in `inputs` are IDs returned by the asset endpoint.

```json
{
  "clientJobId": "local-job-id",
  "kind": "voice",
  "engine": "chatterbox",
  "text": "Welcome to the show.",
  "language": "en",
  "inputs": { "voice": "worker-asset-id" }
}
```

Return `{"id":"remote-job-id"}`. Persist the idempotency mapping before inference starts so the same key returns the same job ID after a timeout or restart. For avatar engines, use the approved audio as the source of speech. The script is metadata.

## Poll status and download output

`GET /v1/jobs/:id` returns one of `queued`, `running`, `completed`, `failed`, `cancel_requested`, or `cancelled` in the `status` field. Use `stage` for a short progress message or `error` to explain a failed job.

A completed job includes one persisted artifact.

```json
{
  "status": "completed",
  "output": { "id": "artifact-id", "name": "narration.wav", "type": "audio/wav" }
}
```

`GET /v1/artifacts/:id` returns the artifact bytes and their media type. The client accepts WAV, MP3, audio MP4, video MP4, and WebM up to 512 MB. Keep artifact IDs valid across restarts.

## Cancel and recover jobs

`POST /v1/jobs/:id/cancel` requests cooperative cancellation. Subsequent status responses report `cancelled` when cancellation takes effect or `completed` if inference finished first.

Fikr Vox saves the worker URL and remote job ID so it can resume polling. When a submission times out before the client receives a remote ID, it can retry with the original idempotency key. Prepared jobs require an explicit submission in the app.
