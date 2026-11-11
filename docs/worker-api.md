# Fikr Vox worker API v1

The client uses this contract to discover capabilities, upload reference media, and track remote jobs. The InfiniteTalk adapter under [`worker/`](../worker/) is retained for historical reference. Fikr Vox no longer offers new InfiniteTalk jobs or resumes unfinished ones.

All endpoints require `Authorization: Bearer <token>` when a token is configured. Serve on a trusted LAN or authenticated tunnel. Use HTTPS for untrusted networks. Never log tokens. JSON responses use `Content-Type: application/json`.

## GET /v1/capabilities

```json
{"apiVersion":1,"engines":[{"id":"chatterbox","name":"Chatterbox","kind":"voice","ready":true},{"id":"infinitetalk","name":"InfiniteTalk","kind":"avatar","ready":false}]}
```

`ready` means the model and dependencies are actually installed and usable. The worker must validate language support, media format, duration, memory and engine requirements when accepting jobs. Unsupported language or media must fail clearly rather than silently falling back to a different voice/model.

## POST /v1/assets

Raw media bytes. Headers: `Content-Type`, URL-encoded `X-Filename`, and `Idempotency-Key` (local asset UUID). Return `{"id":"worker-asset-id"}`. Repeating a key must return the same asset, not create another. Validate file contents, restrict media formats, and impose size limits.

## POST /v1/jobs

Header `Idempotency-Key` is the immutable local job UUID. The worker MUST persist idempotency mappings before starting inference, including across restarts. Repeating a request returns the existing job ID, including after a client timeout.

Voice example:

```json
{"clientJobId":"uuid","kind":"voice","engine":"chatterbox","text":"Hello from my twin.","language":"en","inputs":{"voice":"worker-reference-id"}}
```

Avatar example:

```json
{"clientJobId":"uuid","kind":"avatar","engine":"infinitetalk","text":"Optional narration metadata","language":"en","inputs":{"avatar":"worker-reference-id","audio":"worker-audio-id"}}
```

Return `{"id":"remote-job-id"}`. Avatar audio is authoritative; never regenerate it from the metadata text. Serialize GPU-intensive jobs initially.

The InfiniteTalk adapter accepts `motionStyle: "restrained"` (default), `"podcast"` (the earlier nodding/breathing prompt), or `"minimal"` (experimental stronger restraint). Restrained removes requested nodding and shoulder motion. Minimal also supplies a motion-specific negative prompt and raises accelerated text guidance from 1 to 2; audio guidance remains 2. The wrapper keeps the model's quality negatives but removes `static` and `still picture` when applying this motion negative. These are generation directions, not guaranteed expression limits. Memory limits remain independent of motion style.

`preview: true` renders at most the first 81 frames while preserving the entire source-audio preprocessing context. This allows a 3.24-second comparison with a full take using the same input, seed, portrait and frame window. It is not a replacement for the full-length avatar take.

## GET /v1/jobs/:id

```json
{"status":"running","stage":"Generating speech"}
```

Allowed status: `queued`, `running`, `completed`, `failed`, `cancel_requested`, `cancelled`.

Completed:

```json
{"status":"completed","output":{"id":"artifact-id","name":"narration.wav","type":"audio/wav"}}
```

Failed: `{"status":"failed","error":"A useful, non-secret error description"}`.

Outputs currently accepted: `audio/wav`, `audio/mpeg`, `audio/mp4`, `video/mp4`, `video/webm`. One output per job. IDs must remain retrievable across restarts. Do not report completion until the complete artifact is persisted.

## GET /v1/artifacts/:id

Return raw artifact bytes with their media content type and Content-Length when available. Max 512 MB in this client. The client downloads only from the configured worker origin, never arbitrary artifact URLs, and saves a local copy before marking the job complete.

## POST /v1/jobs/:id/cancel

Request cooperative cancellation; return successful HTTP status. Subsequent status polling must eventually report `cancelled`, or `completed` if it finished before cancellation. A successful request alone is not cancellation confirmation.

## Recovery

Client persists the worker URL and remote job ID. Known remote jobs are polled rather than resubmitted. Unknown submission results are reconciled by retrying the same idempotency key. A job is never sent to a different worker URL after a submission attempt. Prepared jobs require an explicit user submission.
