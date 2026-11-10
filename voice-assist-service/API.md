# Voice Assist API (v1)

Every route needs `Authorization: Bearer <access JWT>`. The caller's current session is checked
with User Service on each request: `401 UNAUTHENTICATED` when rejected, `503 AUTH_UNAVAILABLE`
when User cannot answer. Errors use the shared envelope
`{"error": {"code", "message", "correlationId", "fieldErrors"}}`; messages never echo input.

## `GET /v1/voice-assist/status`

```json
{
  "available": true,
  "provider": "OpenAI",
  "maxRecordingSeconds": 60,
  "processingTimeoutSeconds": 30,
  "retentionNotice": "When recording stops, either when you stop it or automatically at 60 seconds, your audio is sent to OpenAI…"
}
```

`available` is `false` when no provider key is configured or the daily limit is reached. The web
client shows `retentionNotice` on the panel's start screen, before recording (N3NFR3.5).

## `POST /v1/voice-assist/errand-drafts`

The body is the raw recording. `Content-Type` is one of `audio/webm`, `audio/ogg`, `audio/mp4`,
`audio/mpeg`, `audio/wav` or `audio/x-wav` (codec parameters are allowed). Optional
`X-Client-Request-Id` (letters, digits, `.`, `_`, `-`; up to 128) is echoed in the body and the
response header so the client can ignore superseded responses (N3F4.1.3).

Relative times use the server's request time and Asia/Singapore. The draft is never stored and
never creates an errand or reserves credits.

### `200`

```json
{
  "requestId": "4f6c…",
  "generatedAt": "2026-10-30T05:20:00Z",
  "timeZone": "Asia/Singapore",
  "outcome": "DRAFT",
  "transcript": "Get me an iced latte from Tomoro Coffee…",
  "fields": {
    "itemDescription": {"value": "an iced latte", "status": "FILLED", "note": null, "display": null},
    "deliveryLocation": {"value": "COM3 level 1", "status": "FILLED", "note": null, "display": null},
    "reward": {"value": 5, "status": "FILLED", "note": "Taken as 5 credits.", "display": null},
    "acceptanceDeadline": {"value": null, "status": "MISSING", "note": "Enter the latest acceptance time. A delivery time is not used for it.", "display": null},
    "deliveryDeadline": {"value": "2026-10-30T07:00:00Z", "status": "FILLED", "note": null, "display": "Today, 3:00 PM SGT"},
    "supplier": {
      "value": "5d1c…",
      "status": "FILLED",
      "note": "Suggested from your recording. Change it if needed.",
      "suggestion": {"id": "5d1c…", "name": "TOMORO COFFEE", "buildingArea": "Hon Sui Sen Memorial Library", "floor": "2", "pickupLocationDescription": "Main counter"},
      "candidates": []
    }
  }
}
```

| `outcome` | Meaning | `fields` |
| --- | --- | --- |
| `DRAFT` | One errand was described. | present |
| `NO_SPEECH` | No recognisable speech (N3F1.2.1). `transcript` is empty. | `null` |
| `NO_ERRAND` | Speech, but no errand: the model found none, or nothing it reported is in the transcript (N3F1.2.1). | `null` |
| `MULTIPLE_ERRANDS` | More than one independent errand (N3F2.1.5). | `null` |

Field `status`:

| Status | Meaning | `value` |
| --- | --- | --- |
| `FILLED` | Stated and usable. `note` may add information, such as a reward taken as credits. | set |
| `MISSING` | Not said, or not supported by the transcript. | `null` |
| `AMBIGUOUS` | Said, but unclear: a vague time, a non-whole reward, several matching suppliers. | `null` (supplier `candidates` may list options) |
| `CONFLICT` | Contradictory or invalid: delivery not after acceptance, a time already passed, text too long, or a contradiction the model flagged. | the value when there is one; a supplier conflict leaves `value` `null` (`candidates` may list options) |

Supplier suggestion rules (N3F2.2): the spoken supplier name decides; a stated pickup building
or campus area only chooses between branches or vetoes a contradicting match; a building alone
never selects a supplier; the delivery location is never used. A match is suggested only after
Supplier Service confirms it is still `ACTIVE`. No supplier names or other hints are sent to the
speech-to-text model; only the audio is.

### Errors

| Status | `code` | When |
| --- | --- | --- |
| `413` | `AUDIO_TOO_LARGE` | Over `VOICE_ASSIST_MAX_AUDIO_BYTES` (2 MB). |
| `415` | `UNSUPPORTED_AUDIO` | Missing or unsupported `Content-Type`. |
| `422` | `EMPTY_AUDIO` | Empty body. |
| `429` | `RATE_LIMITED` | Requester limit reached; `Retry-After` gives seconds. No provider is called. |
| `502` | `TRANSCRIPTION_FAILED`, `DRAFT_FAILED` | Provider error or unusable result. Record again or use the form. |
| `503` | `VOICE_ASSIST_UNAVAILABLE`, `DAILY_LIMIT_REACHED` | No provider configured, or today's platform limit reached. |
| `504` | `PROVIDER_TIMEOUT` | Processing exceeded the server budget. |

## Operations

`GET /health/live` and `GET /health/ready` return `200`; the service has no database.
