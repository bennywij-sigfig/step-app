# Past Champions Trophy Case — Feature Plan

## Goal

Add a hidden-but-discoverable **Trophy Case** celebrating completed Step Challenges, beginning with:

- 2025 team champion
- 2025 individual champion
- Collective challenge statistics and playful distance comparisons
- Future champions (starting in 2026) published from an immutable final result

The feature should feel special without adding meaningful cost to normal dashboard loading or scrolling.

## Recommended experience

### Entry point

Add a small `🏆 Past Champions` button inside the existing dashboard **Tidbits** disclosure. The button navigates to a dedicated authenticated page at `/champions`.

A separate page is preferable to embedding the trophy case in the dashboard because:

- Trophy assets and animation are not downloaded until requested.
- Dashboard startup and scrolling remain unchanged.
- The page has room for future years without making Tidbits unwieldy.
- The experience can have its own accessible reduced-motion and low-power behavior.

### Trophy Case page

1. **Hero shelf**
   - Year/challenge selector, initially focused on 2025.
   - Team trophy with the winning team name.
   - Metallic shoe award with the individual winner name.
   - Winning score, reporting rate, and challenge dates beneath each award.
   - Co-champions render side by side if a result is tied.

2. **The journey**
   - Total challenge steps.
   - Estimated collective distance.
   - A route strip: **Delhi → Singapore → San Francisco** with a marker showing how many route equivalents were completed and progress through the next route.
   - Clearly label distance as an estimate based on an average stride.

3. **Challenge by the numbers**
   - Participants and teams.
   - Complete daily reports / expected reports.
   - Average steps per participant per day.
   - Biggest *collective* day.
   - Marathon equivalents and estimated pairs of walking shoes used.

4. **Past shelves**
   - Compact cards for other finalized challenges/years.
   - Only finalized, published results are visible to users.

Keep participant-level historical data out of this page except for published champion names. The page remains behind normal app authentication.

## Result rules

### Canonical score

Use the same competition concept as the current leaderboards, but calculate final scores from the full challenge period and the frozen eligible roster:

- **Individual:** `total steps / total challenge days`
- **Team:** `team total steps / (eligible team members × total challenge days)`

At 100% reporting these are equivalent to the current “steps per reported day” scores, while making the final-result denominator explicit and stable.

### What “100% reporting” means

A challenge is ready to publish only when every person in the **admin-confirmed eligible roster** has one valid entry for every challenge date:

`reporting rate = actual distinct person-days / (eligible people × challenge days)`

Requirements:

- The global challenge end window has passed (the existing `getChallengeStatus()` returns `ended`).
- Reporting is exactly 100% for the eligible roster.
- Entries are unique person/date records within the challenge period.
- A final result does not already exist.

Admins may exclude a non-participant from the final eligible roster before publication, but must provide a reason. This is preferable to an opaque “publish below 100%” override: the resulting record can still truthfully say 100% reporting among eligible participants.

Team reporting considers only eligible people assigned to that team in the frozen roster. People without a team can be eligible for the individual award but do not contribute to a team score.

### Ties

Publish exact co-champions rather than using alphabetical order as an invisible tiebreaker. Compare integer totals because all finalists share the same individual denominator; compare team score by exact cross multiplication to avoid floating-point rounding. Display rounded averages only after winners are resolved.

### Immutability

Publishing creates a permanent snapshot. Later user renames, team renames, account archiving, team resets, threshold edits, or step edits must not rewrite a trophy.

Do not treat the existing `challenge_archives` rows as final results. Archives can currently be created more than once and while a challenge remains active. They are useful source data, but “finalized champion result” needs a distinct, one-per-challenge record.

## Data model

Add purpose-built final-result tables rather than a JSON blob.

### `challenge_results`

Suggested columns:

- `id`
- `challenge_id UNIQUE`
- `season_label` (for example `2025`)
- Snapshot fields: `challenge_name`, `start_date`, `end_date`, `timezone`
- `scoring_version` (start with `1`)
- `distance_assumption` (start with `2000_steps_per_mile_v1`, clearly an estimate)
- `eligible_participants`
- `eligible_team_members`
- `team_count`
- `expected_person_days`
- `reported_person_days`
- `reporting_rate`
- `total_steps`
- `average_steps_per_participant_day`
- `biggest_collective_day_date`
- `biggest_collective_day_steps`
- `finalized_at`, `finalized_by_user_id`
- `published_at`

### `challenge_result_roster`

Snapshot the roster used to certify completeness and calculate results:

- `result_id`, source `user_id`
- `user_name`, `user_email` snapshot (email remains admin-only)
- `team_name` snapshot
- `eligible_individual`, `eligible_team`
- `excluded_reason` when relevant

### `challenge_champions`

One or more rows per category to support ties:

- `result_id`
- `category` (`individual` or `team`)
- Source `user_id` when category is individual
- Snapshot `display_name`
- `total_steps`
- `score_steps_per_day`
- `reported_days`
- `team_member_count` for team awards
- Unique key across result/category/source identity

### `challenge_result_daily_stats`

Small aggregate snapshot for historical facts and future visualizations:

- `result_id`, `date`
- `total_steps`, `reporting_count`

The existing `challenge_team_names` and `challenge_team_memberships` are useful historical roster inputs, but finalization should copy the selected roster into result-owned rows so result semantics remain independent of rollover behavior.

## Admin workflow

Add a **Results** action to each ended challenge in Manage Challenges.

### Step 1: Review roster

- Seed from the saved challenge membership snapshot when one exists; otherwise seed from current users/team assignments.
- Show included people, team assignment, missing-day count, and reporting percentage.
- Allow an admin to mark someone ineligible with a required reason.
- Warn if no historical roster snapshot exists because current assignments may not reflect the challenge.

For future challenges, add an explicit **Lock competition roster** action after teams are assigned. Once step reporting begins, roster changes should require an audited admin correction. This removes ambiguity at finalization.

### Step 2: Preview final result

Server returns an authoritative preview containing:

- Readiness and missing reports.
- Proposed individual champion(s).
- Proposed team champion(s).
- Aggregate fun stats.
- Warnings (missing team, no team competitors, no steps, roster changed, etc.).

The client never calculates champions.

### Step 3: Finalize and publish

Enable the button only after challenge end and 100% eligible-roster reporting. A CSRF-protected admin request creates the roster snapshot, final aggregates, and champion rows in one SQLite `BEGIN IMMEDIATE` transaction.

The endpoint is idempotent: retries return the existing result rather than creating duplicates.

Suggested first-release behavior: **admin clicks “Finalize & Publish.”** This is predictable and auditable.

Optional follow-up: add a per-challenge `auto_publish_results` checkbox. When enabled, run the same idempotent finalizer after post-end step writes and during a periodic/startup readiness check. Automatic publishing must still require a roster locked by an admin in advance.

## API and routes

### User-facing

- `GET /champions` — authenticated HTML page.
- `GET /api/champions` — list compact published result summaries.
- `GET /api/champions/:resultId` — one published result, champions, daily aggregates, and comparison metadata.

Do not return roster emails, exclusions, or admin audit details from user endpoints.

### Admin

- `GET /api/admin/challenges/:id/results-readiness`
- `PUT /api/admin/challenges/:id/results-roster` — save eligibility/exclusion decisions.
- `POST /api/admin/challenges/:id/finalize-results` — preview hash/version required in the request to prevent confirming stale data.
- Optional later: `POST /api/admin/challenges/:id/unpublish-results`; unpublishing hides a result but does not recompute or delete it.

## Distance and fun-stat calculations

Store raw canonical aggregates and version the assumptions. Format comparisons at response/render time.

Initial assumptions:

- Familiar approximation: `2,000 steps ≈ 1 mile` (label as an estimate).
- Distance: `(total_steps / 2,000) × 1.609344` kilometers.
- Delhi → Singapore → San Francisco route distance: calculate fixed great-circle legs from versioned city coordinates, not a changeable third-party API.
- Marathon equivalents: distance / `42.195 km`.
- Shoe equivalents: distance / a documented estimate such as `800 km per pair`.

For the route display, show:

- Completed whole route equivalents.
- Current leg and percentage through the next route.
- The fixed approximate route length and stride assumption in an info disclosure.

Avoid claims that participants literally traveled this distance.

## Visual and performance plan

### Phase 1 recommendation: CSS/SVG, not WebGL

A metallic trophy and shoe can look polished using small inline SVGs with gradients, masks, specular highlights, and subtle CSS transforms. This delivers the visual joke with:

- No 3D runtime dependency.
- No model download or shader startup.
- Better accessibility and reduced-motion support.
- Reliable Safari/mobile rendering.

Use a very small tilt/glint animation only while the award is visible. Disable it under `prefers-reduced-motion`, when the page is hidden, or when the award is outside the viewport.

### Optional WebGL enhancement

Treat WebGL as progressive enhancement after the SVG release is measured:

- Load it dynamically only on `/champions`, after the hero enters the viewport.
- Keep SVG as the permanent fallback.
- Render one shared canvas, at most two low-poly objects.
- Cap device pixel ratio (for example `min(devicePixelRatio, 1.5)`) and animation at 30 FPS.
- Pause on `visibilitychange` and through `IntersectionObserver`.
- Respect reduced motion, save-data, WebGL failure, and a conservative low-power/device-memory check.
- Serve all code/models locally; no runtime CDN dependency.
- Budget targets: under 200 KB compressed optional JS, under 150 KB total models/textures, and no requests from the normal dashboard beyond its existing files.

Do not block page content on WebGL initialization. Benchmark Safari/iPhone before enabling it by default.

## 2025 archived-challenge backfill

The official 2025 Step Challenge is already archived in production. That archive is the authoritative source for the first Trophy Case shelf; there is no need for an admin to identify a challenge or manually re-enter winner names.

The local development database is not authoritative production history, so the backfill should run against a fresh production backup/archive export:

1. Take a fresh production backup and locate the archived 2025 Step Challenge record.
2. Assert that the selected archive belongs to the ended 2025 challenge. If multiple snapshots exist for that same challenge, select the final archive explicitly rather than silently choosing the newest row.
3. Use `challenge_archive_steps` for final steps and its snapshot names. Use `challenge_team_memberships` for the historical roster/team assignments when available; otherwise use the team names captured on the archive step rows and flag the weaker roster provenance in the dry run.
4. Run a dry-run finalization report with proposed team champion(s), individual champion(s), reporting completeness, and aggregate stats.
5. Have an admin verify the dry-run report against the archive download.
6. Insert the immutable 2025 result through the same finalization service (or a narrowly scoped backfill script), recording the source archive ID and approving admin.
7. Compare published totals and winners with the downloaded archive before release.

Do not hardcode champion names in HTML or JavaScript. The archive-derived names and totals are copied into immutable result snapshots.

The future 100%-reporting gate should not retroactively block this legacy shelf. If the archived 2025 record cannot prove 100% reporting, publish it through a clearly marked historical backfill mode with provenance such as `Historical result verified from final archive`; do not weaken the 100% rule for 2026 and later challenges.

## Delivery phases

### Phase 1 — Final-result foundation

- Schema and migrations.
- Extract a testable result/finalization service from leaderboard/archive logic.
- Readiness, scoring, ties, aggregate stats, and atomic immutable finalization.
- Admin roster review plus Finalize & Publish flow.
- Authenticated champions APIs.

### Phase 2 — Trophy Case UI and 2025 launch

- `/champions` page and Tidbits entry.
- Accessible SVG/CSS trophy and metallic shoe.
- Route and collective stats.
- 2025 dry run, admin verification, and backfill.
- Responsive/cross-browser validation.

### Phase 3 — Future automation and optional 3D

- Roster lock for future challenges.
- Per-challenge auto-publish preference and idempotent readiness checks.
- Instrument page weight, load time, failures, and animation preference.
- Prototype WebGL behind a feature flag only if it stays within the performance budget.

## Test plan

### Unit

- Inclusive challenge-day count and global end-window enforcement.
- 100% readiness with complete, missing, duplicate, out-of-range, and excluded-user cases.
- Individual and team score calculations.
- Teams of different sizes.
- Users without teams.
- Exact ties/co-champions and deterministic output order.
- Fun-stat calculations and versioned constants.
- Finalization rejects stale previews and is idempotent.

### Integration/security

- User endpoints expose only published results and no emails/exclusion reasons.
- Admin endpoints require admin auth and CSRF for mutations.
- Finalization transaction rolls back completely on failure.
- Post-finalization edits do not alter historical output.
- Only one result can exist per challenge under concurrent requests.
- XSS-safe rendering of historical user/team/challenge names.

### E2E/accessibility/performance

- Tidbits link and dedicated page navigation.
- Empty state before any result is published.
- 2025 shelf on desktop and narrow mobile.
- Keyboard navigation and meaningful award text/alt semantics.
- Reduced-motion behavior.
- SVG fallback when WebGL is unavailable (if WebGL is later added).
- Dashboard network trace confirms trophy assets are not fetched.
- Champions page meets agreed payload and interaction budgets on Mobile Safari.

## Product decisions to confirm before implementation

1. Should exact ties create co-champions (recommended), or is there a desired tiebreak rule?
2. Who belongs to the eligible roster for 100% reporting: all active accounts, only registered challenge participants, or an admin-curated list (recommended)?
3. Is the first release’s audited **Finalize & Publish** button sufficient, with automatic publication added after roster locking?
4. Should historical champion names be visible to every authenticated user indefinitely? (Recommended based on current leaderboard visibility.)
