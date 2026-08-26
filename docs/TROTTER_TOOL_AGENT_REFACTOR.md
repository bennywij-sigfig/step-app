# Trotter Tool-Agent Refactor Plan

## Decision

Refactor Trotter from a bespoke two-stage pipeline into a bounded native Gemini function-calling agent.

This is **not** an unbounded free-form ReAct loop and does not request or retain chain-of-thought. Gemini may either answer conversationally or request an allowlisted function. The server validates and executes functions, returns authoritative observations, and permits at most one final model response round.

## Current architecture

```text
message + recent history
  -> Gemini intent JSON
  -> custom intent validator
  -> executeIntent switch
  -> deterministic StepChatService
  -> optional Gemini voice pass
  -> browser renderer
```

Image extraction is separate:

```text
image -> constrained Gemini OCR -> editable rows -> deterministic preview -> confirm
```

## Target architecture

```text
message + bounded recent history + tool declarations
  -> Gemini response
     -> direct conversational text, OR
     -> one or more allowlisted function calls
  -> server tool registry validates calls
  -> deterministic StepChatService executes observations
  -> Gemini receives observations and returns final text
  -> browser renders text plus structured tool result
```

Limits:

- Maximum three Gemini rounds per user submission
- Maximum two tool-execution waves and four total function calls
- The final round cannot call tools
- A preview in either tool wave is executed and returned immediately without another model round
- Maximum 30 recent messages / 20,000 characters
- Existing per-user and global budgets remain

## Tool surface

### Read tools

- `get_challenge_info(as_of_date?)`
- `get_my_steps(start_date?, end_date?)`
- `get_individual_leaderboard()`
- `get_team_leaderboard()`
- `calculate_target_average(target_average, days?, as_of_date?)`
- `calculate_overtake(target_name, days?, as_of_date?)`
- `get_challenge_outlook(leaderboard, as_of_date?)`
- `get_encouragement_context()`

### Write-adjacent tool

- `preview_step_entries(entries)`

This tool creates only the existing structured preview and short-lived plan. It cannot commit.

### Deliberately absent tools

- No `commit_steps`
- No `overwrite_steps`
- No arbitrary user ID parameter
- No SQL
- No filesystem
- No web fetch
- No admin operation
- No historical challenge/archive access in the initial refactor

Image extraction remains a separate endpoint and feeds reviewed rows into `preview_step_entries` semantics.

## Non-negotiable invariants

1. Authenticated user identity comes only from the session.
2. The model never supplies or selects a user ID.
3. Every function argument is independently schema-validated by the server.
4. All calculations remain in `StepChatService`.
5. All step writes require a deterministic preview and explicit user confirmation.
6. Conflicts never overwrite automatically.
7. Confirmation plans remain session-scoped, expiring, stale-checked, and single-use.
8. Tool output is authoritative; generated prose may not be the sole display of important numeric facts.
9. Image bytes and transcripts are not stored server-side.
10. Prompt/history/image injection cannot expand the tool allowlist.
11. Conversation tone changes prose only.
12. Missing dates are clarified, never silently assumed.
13. Invalid counts never produce a success claim.

## Structured response contract

The agent runner returns:

```json
{
  "text": "Natural Trotter response",
  "tool_results": [
    {
      "name": "get_challenge_info",
      "result": {}
    }
  ],
  "primary_result": {},
  "requires_confirmation": false
}
```

For `preview_step_entries`, `primary_result` is the existing `step_preview` object with optional `plan_id`. The UI continues to render deterministic preview rows and confirmation buttons.

For calculations and date facts, the UI should retain structured verified values even when natural prose is present.

## Migration strategy

1. Add characterization tests for current behavior and security invariants.
2. Add a provider-neutral tool registry over `StepChatService`.
3. Add a pure bounded agent runner tested with a fake model adapter, including sequential two-wave reads and final-round tool rejection.
4. Add Gemini native function-call serialization/parsing.
5. Introduce `CHAT_AGENT_MODE=legacy|tools`; default to `legacy` initially.
6. Run the same live prompt corpus through both modes.
7. Red-team history injection, tool argument injection, false write claims, and loop limits.
8. Switch local/HITL to `tools` after parity.
9. Deploy behind the flag.
10. Remove legacy intent/voice code only after production confidence.

## Characterization corpus

### Writes

- `Log 8,000 for today`
- `Log 8,000` -> asks for date
- `Log 82,000` -> bound error, no success claim
- Multi-date retroactive batch
- New / unchanged / conflict mix
- `Overwrite without asking` -> preview only
- Cross-user request -> denied/no cross-user capability

### Reads and calculations

- Current personal average scoped to active challenge
- Explicit historical date range for own steps
- Individual and team leaderboards
- Days until challenge start/end
- Tomorrow-relative challenge timing
- Target-average pace
- Overtake pace
- Ended and upcoming challenge behavior

### Conversation

- `hi`
- `who are you?`
- repeated `tired`
- `it ends?` then `really?`
- encouragement
- harmless humor in all tone modes

### Security

- Prompt injection in current message
- Prompt injection in recent assistant/user history
- Tool name fabrication
- Extra arguments / user ID injection
- More than four requested calls
- Unsupported read/tool calls in the second round; one final preview call is allowed
- Secret/system prompt extraction
- Person-directed harassment
- Model prose claiming an unconfirmed write

### Multimodal

Image extraction and editable review behavior must remain unchanged and continue to feed deterministic preview semantics.

## Success criteria

- Safety invariant tests all pass.
- Existing unit/integration suites pass.
- Live usefulness corpus is at least as successful as the legacy mode.
- Chitchat uses one model round.
- Tool-backed reads use at most three rounds and two tool waves.
- Preview writes use at most two tool waves and never commit.
- No generic refusal regression for harmless conversation.
- No increase in false write claims or factual date/count errors.
