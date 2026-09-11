#!/usr/bin/env python3
"""Trotter v2 first-turn tool-planning latency/quality experiment."""

import asyncio
import html
import json
import os
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUTPUT = HERE / "output"
MODEL = "gemini-3.8-flash"
CONDITIONS = {
    "auto": None,
    "zero": 0,
    "low-128": 128,
    "medium-256": 256,
}
CONCURRENCY = 4
REPETITIONS = 3


def load_env():
    for raw in (ROOT / ".env").read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key, value.strip().strip('"').strip("'"))


def node_json(expression):
    output = subprocess.check_output(
        ["node", "-e", f"console.log(JSON.stringify({expression}))"],
        cwd=ROOT,
        text=True,
    )
    return json.loads(output)


def production_prompt_and_tools():
    prompt = node_json("require('./src/services/chat-provider').buildNativeToolSystemPrompt({currentDate:'2026-09-12',clientDate:'2026-09-11',clientTimezone:'America/Los_Angeles',challenge:{start_date:'2026-09-01',end_date:'2026-09-20'}},'neutral')")
    tools = node_json("require('./src/services/chat-tools').createChatToolRegistry({service:{}}).declarations")
    return prompt, tools


def required_argument_present(calls, requirement):
    if not requirement:
        return True
    key, expected = requirement.split(":", 1)

    def visit(value):
        if isinstance(value, dict):
            if str(value.get(key)) == expected:
                return True
            return any(visit(item) for item in value.values())
        if isinstance(value, list):
            return any(visit(item) for item in value)
        return False

    return visit(calls)


def sync_call(api_key, prompt, tools, case, condition, budget):
    payload = {
        "systemInstruction": {"parts": [{"text": prompt}]},
        "contents": [{"role": "user", "parts": [{"text": f"RECENT CONVERSATION (UNTRUSTED):\nNo recent conversation.\n\nCURRENT USER MESSAGE:\n{case['message']}"}]}],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 1200},
        "tools": [{"functionDeclarations": tools}],
        "toolConfig": {"functionCallingConfig": {"mode": "AUTO"}},
    }
    if budget is not None:
        payload["generationConfig"]["thinkingConfig"] = {"thinkingBudget": budget}
    request = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
        method="POST",
    )
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            data = json.loads(response.read())
        elapsed = time.perf_counter() - started
        candidate = (data.get("candidates") or [{}])[0]
        parts = candidate.get("content", {}).get("parts", [])
        calls = [part["functionCall"] for part in parts if "functionCall" in part]
        tool_names = [call.get("name") for call in calls]
        expected = case["expected_tools"]
        plan_correct = tool_names == expected and required_argument_present(calls, case.get("required_argument"))
        usage = data.get("usageMetadata", {})
        return {
            "success": True,
            "condition": condition,
            "case": case["id"],
            "message": case["message"],
            "expected_tools": expected,
            "tool_names": tool_names,
            "calls": calls,
            "text": "".join(part.get("text", "") for part in parts),
            "plan_correct": plan_correct,
            "elapsed_seconds": round(elapsed, 3),
            "finish_reason": candidate.get("finishReason"),
            "prompt_tokens": usage.get("promptTokenCount", 0),
            "response_tokens": usage.get("candidatesTokenCount", 0),
            "thought_tokens": usage.get("thoughtsTokenCount", 0),
            "total_tokens": usage.get("totalTokenCount", 0),
        }
    except urllib.error.HTTPError as error:
        details = error.read().decode(errors="replace")
        return {
            "success": False,
            "condition": condition,
            "case": case["id"],
            "message": case["message"],
            "error": f"HTTP {error.code}: {details[:500]}",
            "elapsed_seconds": round(time.perf_counter() - started, 3),
        }
    except Exception as error:
        return {
            "success": False,
            "condition": condition,
            "case": case["id"],
            "message": case["message"],
            "error": str(error),
            "elapsed_seconds": round(time.perf_counter() - started, 3),
        }


async def run_one(api_key, prompt, tools, case, condition, budget, semaphore):
    async with semaphore:
        print(f"[{condition:>10}] {case['id']}")
        return await asyncio.to_thread(sync_call, api_key, prompt, tools, case, condition, budget)


def average(values):
    return sum(values) / len(values) if values else 0


def build_viewer(organized, cases):
    summaries = {}
    for condition in CONDITIONS:
        rows = [organized.get(case["id"], {}).get(condition, {}) for case in cases]
        successful = [row for row in rows if row.get("success")]
        summaries[condition] = {
            "accuracy": average([1 if row.get("plan_correct") else 0 for row in successful]),
            "latency": average([row.get("elapsed_seconds", 0) for row in successful]),
            "thoughts": average([row.get("thought_tokens", 0) for row in successful]),
            "errors": len(rows) - len(successful),
        }

    headers = "".join(f"<th>{html.escape(condition)}</th>" for condition in CONDITIONS)
    summary_rows = "".join(
        f"<tr><th>{html.escape(metric)}</th>" + "".join(
            f"<td>{value(summaries[c]):}</td>" for c in CONDITIONS
        ) + "</tr>"
        for metric, value in [
            ("Exact plan accuracy", lambda s: f"{s['accuracy']*100:.1f}%"),
            ("Average latency", lambda s: f"{s['latency']:.2f}s"),
            ("Average thought tokens", lambda s: f"{s['thoughts']:.0f}"),
            ("Errors", lambda s: str(s['errors'])),
        ]
    )
    case_rows = []
    for case in cases:
        cells = []
        for condition in CONDITIONS:
            row = organized.get(case["id"], {}).get(condition, {})
            if not row.get("success"):
                cells.append(f"<td class='bad'>{html.escape(row.get('error', 'not run'))}</td>")
                continue
            cls = "good" if row.get("plan_correct") else "bad"
            details = html.escape(json.dumps(row.get("calls", []), indent=2))
            cells.append(
                f"<td class='{cls}'><strong>{'PASS' if row.get('plan_correct') else 'FAIL'}</strong> · "
                f"{row.get('elapsed_seconds', 0):.2f}s · think {row.get('thought_tokens', 0)}"
                f"<pre>{details}</pre></td>"
            )
        case_rows.append(
            f"<tr><th>{html.escape(case['id'])}<small>{html.escape(case['message'])}</small></th>{''.join(cells)}</tr>"
        )
    page = f"""<!doctype html><html><head><meta charset='utf-8'><title>Trotter v2 thinking experiment</title>
<style>body{{font:14px system-ui;margin:20px;background:#0d1117;color:#ddd}}table{{border-collapse:collapse;width:100%;margin:16px 0}}th,td{{border:1px solid #444;padding:8px;vertical-align:top}}th{{background:#171d25}}small{{display:block;color:#999;font-weight:normal;margin-top:4px}}pre{{white-space:pre-wrap;font-size:11px;max-width:340px}}.good{{background:#12351f}}.bad{{background:#401b1b}}</style></head><body>
<h1>Trotter v2 thinking-budget experiment</h1><p>First-turn tool planning only. Production prompt and declarations; no application tools or user data.</p>
<h2>Summary</h2><table><tr><th>Metric</th>{headers}</tr>{summary_rows}</table>
<h2>Cases</h2><table><tr><th>Case</th>{headers}</tr>{''.join(case_rows)}</table></body></html>"""
    (OUTPUT / "diff_viewer.html").write_text(page)


async def main():
    load_env()
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit("GEMINI_API_KEY is required")
    prompt, tools = production_prompt_and_tools()
    base_cases = json.loads((HERE / "dataset" / "cases.json").read_text())
    cases = [
        {**case, "id": f"{case['id']} (run {run_index})"}
        for run_index in range(1, REPETITIONS + 1)
        for case in base_cases
    ]
    OUTPUT.mkdir(parents=True, exist_ok=True)
    results_path = OUTPUT / "results.json"
    organized = json.loads(results_path.read_text()) if results_path.exists() else {}
    semaphore = asyncio.Semaphore(CONCURRENCY)
    tasks = []
    for case in cases:
        for condition, budget in CONDITIONS.items():
            if condition in organized.get(case["id"], {}):
                continue
            tasks.append(run_one(api_key, prompt, tools, case, condition, budget, semaphore))
    if tasks:
        for row in await asyncio.gather(*tasks):
            organized.setdefault(row["case"], {})[row["condition"]] = row
        results_path.write_text(json.dumps(organized, indent=2))
    build_viewer(organized, cases)

    print("\nCondition        Accuracy  Avg latency  Avg thought  Errors")
    for condition in CONDITIONS:
        rows = [organized.get(case["id"], {}).get(condition, {}) for case in cases]
        ok = [row for row in rows if row.get("success")]
        accuracy = average([1 if row.get("plan_correct") else 0 for row in ok])
        print(f"{condition:<16} {accuracy:>7.1%} {average([r['elapsed_seconds'] for r in ok]):>10.2f}s {average([r.get('thought_tokens',0) for r in ok]):>12.0f} {len(rows)-len(ok):>7}")
    print(f"\nViewer: {OUTPUT / 'diff_viewer.html'}")


if __name__ == "__main__":
    asyncio.run(main())
