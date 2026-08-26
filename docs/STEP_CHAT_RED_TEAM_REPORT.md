# Trotter Beta — Red-Team Report

Date: 2026-08-25  
Branch: `feat/constrained-step-chat`  
Status: P0/P1 remediation implemented and regression-tested after user approval.

## Scope

The assessment covered authentication, CSRF, prompt injection, secret extraction, cross-user actions, overwrite confirmation, plan replay/forgery/staleness, date/count/batch limits, XSS, transcript privacy, cost controls, provider privacy, SQLite concurrency, and usefulness regressions.

Dynamic testing used two isolated authenticated browser sessions and the live local Gemini 3.5 Flash-Lite adapter. No production step data was modified.

## What held up

- Unauthenticated chat and configuration requests were denied.
- CSRF was required for chat and confirmation writes.
- Prompt-injection attempts could not expose the API key, system prompt, SQL, or arbitrary tools.
- Cross-user write requests were classified as help and had no way to select another user ID.
- Step writes remained scoped to the authenticated session user.
- Out-of-range counts and batches over 31 entries were blocked.
- User-requested overwrites returned previews rather than writing immediately.
- Confirmation plans were isolated by session, short-lived, single-use, and unforgeable in testing.
- Stale plans were rejected after the underlying step value changed.
- User text was rendered with `textContent`; an HTML/event-handler payload did not create DOM nodes or execute.
- No conversation history was sent to Gemini.
- Normal intents for averages, target averages, leaderboards, outlook, encouragement, and challenge timing mostly classified correctly.

## P0 — release blocker

### P0-1: Chat transaction can absorb and roll back an unrelated successful write

`commitPlan` starts a transaction on the application's shared SQLite connection. Other Express requests can enqueue statements on that same connection while the chat transaction is open. A reproduced test showed:

1. Chat started `BEGIN IMMEDIATE`.
2. An unrelated user's insert executed and its callback reported success.
3. Chat detected a stale plan and rolled back.
4. The unrelated insert disappeared despite its successful callback.

This creates a narrow but real cross-request data-integrity failure. It is not caused by prompt injection, but it was introduced by the chat confirmation flow.

Proposed fix: run chat confirmation transactions on a dedicated SQLite connection, or introduce a single application-wide write transaction queue. A dedicated connection is the smaller and safer change.

## P1 — fix before broad beta

### P1-1: Browser transcript is not scoped to an authenticated user

The transcript uses one `sessionStorage` key. Logging out and logging in as another user in the same tab can expose the previous user's local prompts.

Proposed fix: key storage by authenticated user ID and clear it on identity change/logout, or keep the transcript in memory only.

### P1-2: No global model-cost circuit breaker

The per-user limit is 60 model calls per hour. Across roughly 150 authenticated users, the theoretical ceiling is 9,000 calls per hour. There is no global daily request/token budget, kill switch based on spend, or usage metric.

Proposed fix: retain a useful per-user allowance, add a global hourly/daily cap and usage counters, and leave deterministic confirmations outside the model-call budget.

### P1-3: Provider privacy/data-governance decision is unresolved

Only the current message and challenge date boundaries are sent to Gemini, which is good minimization. Users can still type colleague names or sensitive text. Retention/training terms for the exact API/account need confirmation before broad release.

Proposed fix: verify the key's enterprise/API data terms, document the disclosure, and consider Vertex/zero-retention configuration if required.

### P1-4: Relative dates use the app's generous Singapore date ceiling

The same date used to allow globally generous step entry is supplied to Gemini for words such as “today” and “yesterday.” Around timezone boundaries, a Pacific user's intended date can differ by one day. The preview reduces impact but does not remove confusion.

Proposed fix: send a validated browser/user timezone date for language interpretation while retaining the existing server-side maximum-date policy for authorization.

### P1-5: Helpful-intent backend exists, but frontend handling is incomplete

Gemini now classifies `hi`, encouragement, win/loss outlook, and challenge timing into constrained safe intents. The frontend currently lacks dedicated renderers for `chitchat`, `encouragement`, `outlook`, and `challenge_info`, so several still collapse into generic help copy. “Who are you?” also classified as help in live testing.

Proposed fix: complete deterministic, tone-aware renderers and add usefulness regression prompts. Do not broaden write capabilities.

## P2 — hardening and quality

- Unknown service/database errors can be returned too literally to the browser; map unexpected errors to a generic response while logging details server-side.
- Chat-confirmed writes have no dedicated structured audit record beyond ordinary step data.
- Gemini JSON mode is validated server-side, but no provider response schema is supplied; schema use would improve reliability without changing authority.
- Invalid future/out-of-challenge requests were safely classified as help in some tests, but a specific friendly explanation would be more useful.
- The moving model ecosystem requires a pinned model plus a small regression suite before model upgrades.

## Remediation completed

- Chat confirmations now use a dedicated SQLite connection. A regression test verifies that rolling back a stale chat plan cannot roll back an unrelated write.
- Browser transcripts are keyed by authenticated user and removed when identity changes in the same tab.
- Model calls now have default limits of 30 per user/hour, 1,000 globally/hour, and 5,000 globally/day. Confirmation requests do not consume the global model-call budget.
- Browser timezone and local date are supplied for relative-date interpretation after server validation; authorization still uses the established server date policy.
- Unexpected service/database errors are no longer returned verbatim.
- The UI discloses that the current message is processed by Gemini. Production also requires `GEMINI_PAID_SERVICE_ACKNOWLEDGED=true`; this explicitly confirms the key uses a billed project covered by Google's Paid Services data terms.
- Dedicated tone-aware renderers now cover greetings/identity, encouragement, challenge timing, and individual/team outlook.
- “Who are you?” was added explicitly to the safe chitchat classifier guidance.

Post-fix live regression checks confirmed that secret extraction, cross-user writes, person-directed insults, encoded tool requests, and SQL requests remain capability-denied while harmless step humor remains available.

## Contextual conversation re-test

After adding up to 30 recent messages / 20,000 characters of browser-supplied context and a read-only Gemini voice pass, a second red-team round verified:

- Instructions embedded in prior user or assistant messages cannot authorize writes or bypass previews.
- Historical prompt/secret extraction attempts remain denied.
- Cross-user requests remain incapable of selecting another user.
- Person-directed harassment remains refused without disabling harmless sarcasm or humor.
- Write previews remain deterministic and do not use the voice pass.
- The voice pass receives bounded authoritative facts and cannot modify them.
- Composed text and historical content remain rendered as text, not HTML.
- Oversized and unsupported history roles are filtered and bounded server-side.

Usefulness checks also passed for repeated “tired,” “it ends?”, “really?”, greetings, and tomorrow-relative challenge timing. Trotter produced varied contextual responses, and the deterministic result correctly reported 11 remaining days for the next date rather than asking the model to invent the arithmetic.

## Multimodal image extraction re-test

The image-to-steps prototype was tested with synthetic screenshots and adversarial text embedded in an image.

- Images remain in memory and are not persisted by Step Challenge.
- JPEG/PNG/WebP type, byte signature, 5 MB server limit, authentication, CSRF, and dedicated rate limits are enforced.
- Gemini has extraction-only instructions and no write capability.
- Strict validation keeps only bounded date/count/confidence/note fields.
- A screenshot containing instructions to modify an admin, insert 70,000 steps, use a 2099 date, and skip confirmation did not produce those candidates; the legitimate visible 6,543-step row was extracted.
- Extracted rows remain editable and must pass the normal deterministic challenge/date/count/conflict preview before confirmation.
- Model notes, warnings, raw dates, and user content render through text nodes rather than HTML.

## Tool-agent production correction

The first production tool-agent release allowed only one tool wave plus a final response. Production logs showed normal prompts being rejected when Gemini requested a second read-tool wave. This was an orchestration limitation, not unsafe user behavior, so production was immediately returned to legacy mode.

The corrected bounded agent now allows:

- At most three Gemini rounds
- At most two tool-execution waves
- At most four total tool calls
- At most one preview
- No tools in the final round
- Immediate return when a preview is created
- Neutral internal-agent error wording for tool/protocol failures; per-request legacy fallback is intentionally disabled during dogfooding so native-agent failures remain visible
- Whole-system `CHAT_AGENT_MODE=legacy` remains the explicit operational rollback

Gemini conversation state now preserves each exact model function-call content block, call ID, and thought signature across sequential waves.

Post-fix validation included a live three-round request that first inspected the leaderboard, then calculated the pace needed to overtake its leader, then produced a final answer. Seven complex multi-fact prompts completed without fallback or error. Full write lifecycle and indirect data-injection tests remained clean.

## Repeatable regression suites

The red-team process is now executable rather than only documented:

```bash
npm run test:trotter:redteam
npm run test:trotter:redteam:live
```

The deterministic CI tier runs 63 tests across adversarial capability, bounded-agent, route, transaction, image, and intent contracts without calling Gemini. The opt-in live tier runs a versioned prompt corpus against local Gemini tool mode and emits a JSON report.

Initial live-suite result: 15 passed, 0 failed, 0 skipped, including visual prompt injection; average response latency was 918 ms. The three-round sequential leader/overtake case completed in 2.1 seconds.

Tool/protocol incidents now return a `TROT-XXXXXX` reference and emit prompt-free structured logs containing the failure category, internal reason, round/tool metadata when available, model, and agent mode. Prompts, history, images, and OCR text are not logged.

See `docs/TROTTER_REDTEAM_GUIDE.md`.

## Usefulness balance

The red-team result supports keeping the conversational surface broader while holding the capability surface narrow:

- Greetings, identity, encouragement, humor, outlook, and challenge information are safe to answer.
- Tone may change wording but never authorization or arithmetic.
- The server should continue to own calculations, user identity, data access, validation, previews, and writes.
- Security regressions and usefulness regressions should be tested together.

## Dynamic run summary

- 29 primary checks executed.
- Authentication, CSRF, injection, secret, overwrite, replay, forgery, stale-plan, batch, count, and XSS boundaries held.
- Five harness expectations differed from observed behavior; four were safe `help` classifications rather than policy bypasses, and one was the known “who are you?” usefulness miss.
- The shared-connection transaction issue was separately reproduced deterministically and is the only P0 finding.
