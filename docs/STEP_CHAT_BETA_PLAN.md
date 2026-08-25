# Trotter — Constrained Chat Beta

## Product scope

Trotter is opened from a **Trotter (beta)** button immediately left of **Save Steps**.
It supports:

- Previewing one or many step entries for the authenticated user
- Explicit conflict handling before any overwrite
- Individual and team leaderboard queries
- Deterministic “what average do I need to beat X?” calculations
- Neutral, encouraging, droll, or lightly sarcastic presentation

It does not support arbitrary questions, web access, SQL, admin actions, or modifying another user.

## Conversation retention

- The server does not store chat transcripts.
- Each model request receives only the current user message plus minimal challenge context.
- The visible transcript is kept in browser `sessionStorage` only, scoped to the authenticated user, so it survives a refresh in the same tab but is removed when the tab/session ends.
- Changing authenticated users clears the previous user's transcript from the tab.
- A Clear button removes the browser transcript immediately.
- Pending write plans are kept in the authenticated server session for at most five minutes; these are structured entries, not conversation text.

## Safety boundary

1. The model maps the current message to a strict allowlisted intent schema.
2. The server validates every field and performs all database reads and calculations.
3. Recording steps first creates a read-only preview.
4. The UI displays new, unchanged, and conflicting dates.
5. A write occurs only after the user presses an explicit confirmation button tied to a short-lived, single-use plan ID.
6. The server rechecks existing values before committing to prevent stale-plan overwrites.

The model never receives a general-purpose write, SQL, shell, URL-fetch, filesystem, admin, or cross-user tool.

## Initial API

- `GET /api/chat/config` — feature availability and limits
- `POST /api/chat` — interpret one standalone message and return a response or write preview
- `POST /api/chat/confirm` — commit the exact pending plan using `new_only` or `overwrite_conflicts`

All endpoints require the existing authenticated session. POST endpoints require CSRF protection and a dedicated chat rate limiter.

## Allowed intents

- `record_steps`
- `show_my_steps`
- `individual_leaderboard`
- `team_leaderboard`
- `calculate_overtake`
- `calculate_target_average`
- `challenge_outlook`
- `challenge_info`
- `encouragement`
- `step_chitchat`
- `help`

## Limits

- 2,000 characters per user message
- 31 dates per batch in the beta
- 0–70,000 steps per date, matching the existing application rule
- Current or past dates only
- Active challenge date range when a challenge exists
- One model interpretation call per message
- 30 model calls per user per hour by default
- 1,000 global model calls per hour and 5,000 per day by default
- No autonomous tool loop

## Provider boundary

The provider adapter is isolated from deterministic chat operations. The first adapter uses Gemini's server-side REST API. It remains unavailable unless all three server settings are present:

- `CHAT_ENABLED=true`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GEMINI_PAID_SERVICE_ACKNOWLEDGED=true` in production

The production acknowledgement confirms that the Gemini key belongs to a Cloud project with active billing and is therefore handled under Google's Paid Services data terms. Under the terms reviewed on 2026-08-25, paid prompts/responses are not used to improve Google's products, though they may be logged for a limited period for abuse prevention and legal obligations. Unpaid Gemini API usage must not receive sensitive, confidential, or personal information.

The API key is never returned to the browser. Keeping `CHAT_ENABLED` off allows the UI and deployment to be reviewed before live model traffic begins.

## HITL acceptance checks

- Single-date and batch entry phrasing
- Relative and explicit dates
- Duplicate dates in one request
- Existing-value conflicts
- Save-new-only and overwrite confirmation
- Stale confirmation plans
- Individual/team leaderboard requests
- Overtake calculations and assumptions
- Prompt-injection and cross-user requests
- Mobile portrait and landscape layout
- Transcript clear/refresh/tab-close behavior
