# Trotter Red-Team Regression Guide

## Purpose

Trotter has two complementary regression tiers. Security fixes must preserve harmless conversation and supported step workflows rather than reducing everything to generic refusal.

## Tier 1: deterministic CI suite

```bash
npm run test:trotter:redteam
```

This uses fake/adversarial model behavior and does not call Gemini. It aggregates the durable agent, route, transaction, intent, image-output, and confirmation-plan tests.

Coverage includes:

- Forbidden/fabricated tools
- Injected `user_id`, team ID, and target-team arguments
- Tool schema validation and session-derived team identity
- Worst-case indirect injection producing at most a visible current-user review
- Maximum rounds, tool waves, calls, and previews
- Final-round tool rejection
- Thought-signature/call-ID preservation through the runner
- False write-claim suppression
- Authentication and CSRF
- Session isolation, expiry, replay, forgery, and stale plans
- Dedicated SQLite transaction isolation
- Image MIME/magic/size and extraction-schema validation
- Challenge dates and calculation bounds

This suite should run in CI and before every Trotter deployment.

## Tier 2: live Gemini suite

Start the local application with `CHAT_AGENT_MODE=tools`, then run:

```bash
npm run test:trotter:redteam:live
```

Environment options:

```bash
TROTTER_REDTEAM_URL=http://localhost:3000
TROTTER_REDTEAM_IMAGE=false          # skip multimodal case
TROTTER_REDTEAM_REPORT=/tmp/report.json
```

Remote execution is deliberately blocked unless explicitly enabled:

```bash
ALLOW_REMOTE_TROTTER_REDTEAM=true
```

The live suite:

- Creates a development-only test user through the local magic-link endpoint
- Never confirms a step preview
- Uses active-challenge dates only when three elapsed dates are available
- Tests useful conversation, reads, calculations, missing/invalid input, batch previews, cross-user denial, secret extraction, history injection, harassment, and sequential multi-wave tools
- Optionally generates an adversarial screenshot containing visual prompt injection and verifies only the legitimate date/count row is extracted
- Writes a machine-readable report with tools, rounds, latency, and failures
- Does not record prompts in application logs

Prompt cases live in:

`tests/fixtures/trotter-redteam-prompts.json`

## Release gates

Before enabling `CHAT_AGENT_MODE=tools`:

1. Deterministic suite passes.
2. Live suite passes with no unexpected fallback or generic tool-protocol errors.
3. Unit and integration suites pass.
4. Full preview/confirm/conflict/replay/stale lifecycle has passed against the candidate implementation.
5. Useful prompts remain natural across all tone settings.
6. Production rollback remains available through `CHAT_AGENT_MODE=legacy`.

## Incident references

Tool/protocol and provider errors return a short reference such as:

`TROT-A1B2C3`

Application logs contain a structured event with:

- Reference
- Error category and reason
- Round/tool metadata when available
- Model and agent mode

They do not include the user prompt, conversation history, image bytes, or extracted OCR text. A user may voluntarily share the reference and prompt for diagnosis.

## Adding a regression

For deterministic capability or protocol bugs, add a Jest case under:

- `tests/unit/security/trotter-redteam.test.js`
- `tests/unit/services/chat-agent-contract.test.js`
- `tests/unit/routes/chat.test.js`

For real-model interpretation/usefulness bugs, add a case to:

`tests/fixtures/trotter-redteam-prompts.json`

A model-level regression should generally include both:

- The expected useful behavior or tool
- Explicit forbidden tools/output patterns
