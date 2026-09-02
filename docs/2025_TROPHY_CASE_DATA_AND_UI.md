# 2025 Trophy Case — Verified Archive Data and UI Direction

## Source selection

Production was inspected read-only on September 2, 2026. The official challenge has two archives:

| Archive | Created (UTC) | Records | Participants with entries | Total steps | Latest source update |
|---|---:|---:|---:|---:|---:|
| `1` | 2025-08-19 01:47 | 685 | 52 | 8,586,237 | 2025-08-18 18:19 |
| `2` | 2025-08-21 21:44 | 748 | 52 | 9,111,884 | 2025-08-20 05:30 |

**Use archive 2.** It is a strict improvement over archive 1:

- 63 additional person/day records.
- 3 previously present records were updated.
- 682 records are unchanged.
- No archive-1 person/day records are absent from archive 2.
- Net increase of 525,647 steps.
- The individual and team champions are the same in both archives.

Archive 2 validation checks passed:

- All 15 challenge dates are represented.
- No dates fall outside August 1–15, 2025.
- No duplicate participant/date rows.
- No negative step entries.

Challenge metadata:

- **Name:** SigFig Step Challenge 2025
- **Dates:** August 1–15, 2025 (15 days)
- **Ranked reporting threshold:** 100%

## Verified champions

The 100% threshold means only participants/teams with all 15 person-days are ranked.

### Individual champion

**akshay.sharma — Walkaholics**

- 594,176 total steps.
- 15 of 15 days reported.
- 39,611.73 average steps/day.

Cross-check:

1. akshay.sharma — 39,611.73/day
2. hardik.agarwal — 35,789.73/day
3. vaibhav.sharma — 26,184.20/day

The result is unchanged between archives 1 and 2.

### Team champion

**Scrambled Legs**

- 1,664,407 total steps.
- 6 reporting members.
- 90 of 90 member-days reported (100%).
- 18,493.41 average steps per member-day.

Cross-check among 100%-reporting teams:

1. Scrambled Legs — 18,493.41/member-day
2. Walkaholics — 17,348.73/member-day
3. Game of Soles — 13,134.38/member-day

Scrambled Legs and Walkaholics were already complete in archive 1; the winner and scores are unchanged in archive 2.

## Aggregate-data cleanup decision

Archive 2 contains one obvious non-team test record:

- `benny+test`
- One entry on August 13.
- 69,999 steps.
- No team.

It does not affect either champion because it is far below the 100% reporting requirement. It does inflate collective challenge stats.

**Recommendation:** retain the untouched archive as provenance, but exclude this explicitly identified test account from public aggregate statistics. Record that exclusion in the immutable result metadata rather than silently filtering all unranked or no-team participants.

Public aggregate dataset after that exclusion:

- 51 participants across 9 teams.
- 747 submitted person-days out of 765 possible (97.65%).
- 9,041,885 total steps.
- 12,104 average steps per submitted person-day.
- 48 people reported all 15 days (94.1% of participants).
- Other reporting counts: one person at 14 days, one at 10 days, and one at 3 days.

For comparison, the literal untouched archive values are 52 participants, 748 records, and 9,111,884 steps. The UI should not mix the untouched total with the cleaned participant count.

The modern `challenge_team_memberships` snapshot is empty for this older challenge. Historical team membership must therefore come from the `user_team` copied into archive step rows. The 51 non-test participants are all assigned across nine teams. This is adequate for reproducing the archived leaderboard, but the result provenance should say `archive step-team snapshot` rather than claiming a complete independently frozen roster.

## Best notable statistics

These are strong, understandable facts for the public experience. Calculations below use the recommended cleaned aggregate dataset.

### 1. More than nine million steps

**9,041,885 collective steps**

This should be the main aggregate number. It is direct archive data, requires no estimation, and reads well as “Nine million steps in fifteen days.”

### 2. Delhi → Singapore → toward San Francisco

For a playful distance comparison, use the transparent approximation:

- 2,000 steps ≈ 1 mile.
- 9,041,885 steps ≈ 4,521 miles / 7,276 km.
- Delhi → Singapore great-circle distance ≈ 4,142 km.
- Singapore → San Francisco great-circle distance ≈ 13,582 km.

The group therefore made it:

- All the way from **Delhi to Singapore**, then
- About **3,133 km onward toward San Francisco**, or
- About **23% of the Singapore → San Francisco leg**.

For UI copy, round conservatively:

> About 7,300 km together—Delhi to Singapore, then nearly a quarter of the way to San Francisco.

Display the “2,000 steps ≈ 1 mile” assumption in an info disclosure. City-leg distances should come from fixed, versioned coordinates and a Haversine calculation rather than an external API.

### 3. A huge final push

**August 15 was the biggest collective day:**

- 745,438 steps.
- 48 reports.
- 15,530 average steps per report.
- About 24% above the challenge’s average collective day (602,792 steps).

Suggested copy:

> Strong finish: the final day was the biggest day of the challenge.

This is more celebratory than highlighting one participant’s extreme single-day entry.

### 4. Forty-eight perfect reporters

**48 participants completed all 15 daily reports.**

Suggested copy:

> 48 perfect reporting streaks—720 fully reported person-days.

This connects directly to the challenge’s 100% ranked threshold.

### 5. Marathon equivalent

Using the same 2,000-steps-per-mile approximation:

- About 7,276 km total.
- About **172 marathons** at 42.195 km each.

Suggested copy:

> Enough collective distance for roughly 172 marathons.

This works as a secondary tile. The route visualization is more distinctive and should get priority.

## Recommended public data set

### Hero awards

- Team: Scrambled Legs — 1,664,407 total; 18,493/member-day; 100% reporting.
- Individual: akshay.sharma — 594,176 total; 39,612/day; 100% reporting.

### Main collective story

- 9,041,885 steps.
- 51 participants.
- 9 teams.
- 15 days.
- 48 perfect reporters.
- Biggest day: August 15, 745,438 steps.
- Estimated distance: about 7,300 km.
- Route position: Delhi → Singapore complete, 23% toward San Francisco.
- Approximately 172 marathons.

Avoid putting all of these above the fold. The strongest sequence is: champions, nine-million-step reveal, route, then a small stats grid.

## Trophy Case UI plan

### Location and navigation

Add `🏆 Past Champions` as a full-width row in dashboard **Tidbits**. It opens a dedicated authenticated route, `/champions`.

The dashboard should not load Trophy Case data, art, or animation code. The only dashboard cost is the small link.

### Page concept: “The Trophy Case”

The design should feel like a lit display cabinet rather than another leaderboard. It is a historical celebration, not a dense data table.

#### Header

- Back to dashboard.
- Eyebrow: `PAST CHAMPIONS`.
- Title: `The Trophy Case`.
- Compact year control, initially only `2025`; designed to accept 2026 and later.

#### Award shelf

Desktop: two cards on one shelf. Mobile: stacked cards.

**Team trophy card**

- Gold/brass SVG trophy.
- Small engraved label: `2025 TEAM CHAMPION`.
- Large name: `Scrambled Legs`.
- `18,493 steps per member-day`.
- Supporting line: `1,664,407 steps · 6 teammates · 100% reporting`.

**Individual shoe card**

- Chrome/metallic winged walking shoe SVG.
- Small engraved label: `2025 INDIVIDUAL CHAMPION`.
- Large name: `akshay.sharma` (or an admin-approved display capitalization stored in the result snapshot).
- `39,612 steps per day`.
- Supporting line: `594,176 steps · all 15 days reported`.

Give the cards equal visual weight. The team card can use warm gold; the individual shoe can use cool silver/chrome.

#### Nine-million-step reveal

A wide, simple centerpiece beneath the awards:

> **9,041,885 steps**  
> 51 people. 9 teams. 15 days.

Animate the number only once with a short opacity/translate reveal; do not use a long count-up animation that delays reading.

#### Journey route

Use a horizontal route on desktop and a vertical route on narrow mobile:

`Delhi  ━━━━━  Singapore  ━━●━━━━━━  San Francisco`

- Delhi → Singapore is shown complete.
- The marker sits 23% into Singapore → San Francisco.
- Text beneath: `About 7,300 km together`.
- An info button explains the stride approximation and great-circle city distances.
- Do not render a full geographic map; the stylized route is faster, clearer, and avoids map dependencies.

#### Notable-stat plaques

A two-by-two responsive grid:

- `48` — perfect reporting streaks.
- `745,438` — steps on the biggest day, August 15.
- `~172` — marathon equivalents.
- `+24%` — final day versus an average challenge day.

Use concise supporting copy and avoid another leaderboard/ranking list.

#### Footer plaque

Include challenge dates and a restrained provenance note:

> SigFig Step Challenge 2025 · August 1–15 · Final results from the verified challenge archive.

### Visual implementation

#### MVP: SVG and CSS

Use inline SVG illustrations with gradients, masks, and subtle highlights:

- Trophy: 2–3 gold gradient layers, dark engraved base, soft shelf shadow.
- Shoe: silver gradient, one iridescent accent, metallic glint mask.
- Shared cabinet background: dark translucent panel that adapts to the app theme.
- Very subtle pointer/gyro-independent parallax on capable devices only.

Animations:

- One short shelf-light fade on entry.
- A glint crossing each award once, not continuously.
- A small tilt on pointer hover for desktop.
- No animation under `prefers-reduced-motion`.
- Pause/avoid work while offscreen or when the document is hidden.

This should look dimensional without WebGL and remain excellent on Mobile Safari.

#### WebGL decision

Do not ship WebGL in the first version. It adds runtime, model, context-loss, and mobile GPU costs without improving the historical story enough to justify them. The SVG awards are the primary art direction, not merely fallback art.

After launch, an optional low-poly WebGL prototype can be tested behind a feature flag on `/champions` only. It should be accepted only if it stays inside the budgets in `PAST_CHAMPIONS_TROPHY_CASE_PLAN.md` and clearly looks better than the SVG version.

### Accessibility

- Award illustrations are decorative; champion/category text remains real HTML.
- Route progress has a complete text equivalent.
- Year controls are keyboard operable.
- Metallic gradients maintain readable contrast in every app theme.
- Reduced-motion users see the fully lit final state immediately.
- No meaning relies only on gold versus silver color.

### Responsive behavior

- Awards: 2 columns above roughly 700 px; one column below.
- Route: horizontal above roughly 600 px; vertical below.
- Stat plaques: 4 columns wide desktop, 2 columns tablet/mobile, 1 only on very narrow screens if needed.
- Keep award names and primary numbers visible without horizontal scrolling at 320 px.

## Remaining confirmation before implementation

Confirm that `benny+test` and its single 69,999-step entry should be excluded from public collective statistics. This does **not** affect either verified champion.
