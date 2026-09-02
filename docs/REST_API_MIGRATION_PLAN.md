# REST API Migration Plan

## Decision

Replace the unused hand-written MCP/JSON-RPC integration with a small versioned REST API. Production currently has no active MCP tokens and no MCP calls in the last 30 days, so no live credential migration is required.

## API contract

All endpoints require `Authorization: Bearer <token>` and return JSON.

- `GET /api/v1/me` — authenticated profile, team, and active challenge (`profile:read`)
- `GET /api/v1/steps?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` — own step history (`steps:read`)
- `POST /api/v1/steps` — create a new own-step entry; returns `409` if the date exists (`steps:write`)
- `PUT /api/v1/steps/:date` — explicitly replace an existing own-step entry; returns `404` if absent (`steps:write`)

Create and replace are intentionally separate so automation cannot silently overwrite through an ambiguous flag.

## Token security

- Generate 256-bit random `step_...` bearer tokens.
- Store only SHA-256 token hashes and a short display prefix.
- Return the raw token only once from the admin creation response.
- Support explicit scopes, expiration, last-used time, and revocation.
- Apply a coarse pre-authentication IP burst limit, then a per-token hourly limit after validation.
- Do not accept credentials in URLs or request bodies.

## Data integrity and audit

- Derive user identity only from the validated token.
- Reuse challenge date/count rules: valid calendar date, no future date, active-challenge boundaries, and counts from 0–70,000.
- Write one compact audit row per request with token/user/action/status, bounded structured details, IP, and timestamp.
- Never log raw bearer tokens.

## Administration

Replace the MCP admin tab with API Tokens:

- Create a token for a selected user.
- Select read-only or read/write scopes.
- Show the raw token once.
- List metadata only: prefix, scopes, expiry, last use, and revoked status.
- Revoke rather than delete tokens so audit history remains attributable.

## Removal sequence

1. Add REST token schema, auth middleware, service, routes, and tests.
2. Replace admin MCP token management with REST API token management.
3. Remove `/mcp`, MCP capability/download/setup routes, bridges, MCP-specific tests, and obsolete setup documentation.
4. Keep legacy MCP database tables untouched in existing production databases for historical preservation; new application code no longer reads or writes them.
5. Run unit, integration, security, local smoke, and production health checks.

## Test gates

- Missing, malformed, unknown, expired, and revoked bearer tokens fail.
- Raw tokens are returned once and never listed or stored.
- Scope enforcement covers every endpoint.
- Tokens cannot select another user.
- Dates/counts/challenge boundaries are enforced.
- POST conflict and PUT absent-entry behavior are explicit.
- PUT updates only existing records.
- Audit records and last-used timestamps are written without token leakage.
- Per-token and pre-authentication limiter identities are correct.
- Removed MCP routes return `404`.
