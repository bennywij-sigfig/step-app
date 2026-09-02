# Step Challenge REST API

Base URL: `https://step-app-4x-yhw.fly.dev/api/v1`

Ask an administrator to create a scoped API token. The raw token is shown once. Store it in a secret manager or environment variable and send it only in the `Authorization` header:

```bash
export STEP_API_TOKEN='step_...'
```

## Profile

```bash
curl -H "Authorization: Bearer $STEP_API_TOKEN" \
  https://step-app-4x-yhw.fly.dev/api/v1/me
```

Requires `profile:read`.

## Step history

```bash
curl -H "Authorization: Bearer $STEP_API_TOKEN" \
  'https://step-app-4x-yhw.fly.dev/api/v1/steps?start_date=2026-09-01&end_date=2026-09-15'
```

Requires `steps:read`. Results always belong to the token owner.

## Create an entry

```bash
curl -X POST \
  -H "Authorization: Bearer $STEP_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-09-02","count":8500}' \
  https://step-app-4x-yhw.fly.dev/api/v1/steps
```

Requires `steps:write`. Returns `201` for a new entry and `409` if that date already exists. A conflict is never overwritten by `POST`.

## Explicitly replace an entry

```bash
curl -X PUT \
  -H "Authorization: Bearer $STEP_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"count":9000}' \
  https://step-app-4x-yhw.fly.dev/api/v1/steps/2026-09-02
```

Requires `steps:write`. Returns `404` when the date does not already exist; use `POST` to create it.

## Rules

- Dates use `YYYY-MM-DD`.
- Counts are whole numbers from 0 through 70,000.
- Future dates are rejected.
- When a challenge is active, dates must be inside its inclusive date range.
- Tokens expire and can be revoked immediately.
- Do not put tokens in URLs, request bodies, chat messages, source control, or logs.
