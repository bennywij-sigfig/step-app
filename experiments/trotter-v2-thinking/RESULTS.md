# Trotter v2 thinking-budget experiment

First-turn tool-planning comparison using the production Gemini 3.8 Flash prompt and tool declarations. The dataset contains 16 synthetic Trotter requests, including multi-tool planning, relative dates, ambiguous/multiple targets, proposal-only writes, and forbidden cross-user/admin writes.

Three runs were performed per condition (48 samples each; 192 calls total). No application tools were executed and no production/user data was used.

| Condition | Successful samples | Exact tool-plan accuracy | Mean latency | Median latency | Approx. p95 | Mean thought tokens |
|---|---:|---:|---:|---:|---:|---:|
| Auto thinking | 48/48 | 100% | 1.731s | 1.373s | 3.492s | 188.6 |
| Zero | 47/48 | 100% | 1.535s | 1.205s | 3.407s | 46.6 |
| Low (128) | 48/48 | 100% | **1.415s** | **1.109s** | 2.802s | 60.4 |
| Medium (256) | 48/48 | 100% | 1.440s | 1.182s | **2.534s** | 51.0 |

The one zero-budget error was a network read timeout, not a model or plan error.

## Interpretation

- All tested budgets retained exact first-turn tool-plan accuracy on this dataset.
- Low-128 reduced mean first-turn latency by about 18% versus auto thinking.
- Medium-256 had similar mean latency and the best observed tail latency.
- Tool-planning thought tokens fell by roughly 68-73% under the bounded conditions.
- This experiment does not yet establish final-response prose quality across a complete multi-turn agent run. A production change should therefore begin as a hidden v2 canary rather than replacing auto thinking outright.

Raw results and the comparison viewer are under `output/`.
