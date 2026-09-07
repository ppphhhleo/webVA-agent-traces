#!/usr/bin/env python3
"""Build the public, trace-level work-mode analysis dataset."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import urlopen


GUI_ACTION_TYPES = {
    "click", "left_click", "right_click", "double_click", "triple_click",
    "desktop_click", "desktop_double_click", "desktop_triple_click", "desktop_right_click",
    "move", "desktop_move", "drag", "desktop_drag", "scroll", "desktop_scroll",
    "type", "desktop_type", "keypress", "desktop_keypress", "hotkey", "desktop_hotkey",
    "desktop_wait", "desktop_screenshot",
}
OFFSCREEN_ACTION_TYPES = {
    "shell", "desktop_shell", "run_python", "desktop_python", "run_shell",
    "write_file", "read_file", "browser_script", "run_javascript",
}


def fetch_json(url: str) -> dict:
    with urlopen(url, timeout=60) as response:
        return json.load(response)


def requested_actions(event: dict) -> list:
    data = event.get("data") or {}
    if isinstance(data.get("actions"), list) and data["actions"]:
        return data["actions"]
    if data.get("action") is not None:
        return [data["action"]]
    if isinstance(data.get("requested_actions"), list):
        return data["requested_actions"]
    if data.get("requested_action") is not None:
        return [data["requested_action"]]
    return []


def action_type(action) -> str:
    if not isinstance(action, dict):
        return "output"
    return str(action.get("type") or action.get("action") or action.get("name") or "output").lower()


def round_mode(event: dict) -> str:
    types = {action_type(action) for action in requested_actions(event)}
    if types & OFFSCREEN_ACTION_TYPES:
        return "offscreen"
    if types & GUI_ACTION_TYPES:
        return "gui"
    return "neutral"


def analyze_trace(base_url: str, trace: dict) -> dict:
    trajectory = fetch_json(urljoin(base_url, trace["trajectory_url"]))
    rounds = [
        event for event in trajectory.get("events", [])
        if event.get("event_type") == "model_message"
    ]
    modes = [round_mode(event) for event in rounds]
    action_count = sum(
        action_type(action) not in {"final_answer", "task.final_answer", "output"}
        for event in rounds
        for action in requested_actions(event)
    )
    total = len(modes)
    gui = modes.count("gui")
    offscreen = modes.count("offscreen")
    neutral = total - gui - offscreen
    working = gui + offscreen
    first_index = next((index + 1 for index, mode in enumerate(modes) if mode == "offscreen"), None)

    return {
        "trace_number": trace.get("trace_number"),
        "trace_id": trace.get("trace_id"),
        "task_id": trace.get("task_id"),
        "task_type": trace.get("task_type"),
        "task_prompt": trace.get("task_prompt"),
        "model": trace.get("model"),
        "completion_status": (trace.get("summary") or {}).get("completion_status"),
        "task_score": (trace.get("summary") or {}).get("check_answer_score"),
        "acting_time_ms": (trace.get("summary") or {}).get("acting_time_ms"),
        "input_tokens": (trace.get("summary") or {}).get("input_tokens"),
        "output_tokens": (trace.get("summary") or {}).get("output_tokens"),
        "total_tokens": sum(
            value or 0
            for value in (
                (trace.get("summary") or {}).get("input_tokens"),
                (trace.get("summary") or {}).get("output_tokens"),
            )
        ),
        "action_count": action_count,
        "total_rounds": total,
        "gui_rounds": gui,
        "offscreen_rounds": offscreen,
        "neutral_rounds": neutral,
        "gui_percent": round(gui / working * 100, 2) if working else 0,
        "offscreen_percent": round(offscreen / working * 100, 2) if working else 0,
        "first_offscreen_round": first_index,
        "first_offscreen_position_percent": round(first_index / total * 100, 2) if first_index and total else None,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--base-url",
        default="https://agent-traces-collection.s3.us-west-2.amazonaws.com/data/",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "analysis" / "data.json",
    )
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/") + "/"
    catalog = fetch_json(urljoin(base_url, "catalog.json"))["traces"]
    # The public catalog contains ten retry/duplicate entries. The paper cohort is
    # one trial-one trajectory per (model, task): retain the first catalog entry
    # for each pair. Catalog position is stable source provenance and deliberately
    # avoids selecting a retry based on its outcome or score.
    canonical_catalog = []
    excluded_duplicates = []
    seen_cases = set()
    for trace in catalog:
        case = (trace.get("model"), trace.get("task_id"))
        if case in seen_cases:
            excluded_duplicates.append({
                "trace_number": trace.get("trace_number"),
                "trace_id": trace.get("trace_id"),
                "model": trace.get("model"),
                "task_id": trace.get("task_id"),
            })
            continue
        seen_cases.add(case)
        canonical_catalog.append(trace)

    if len(canonical_catalog) != 120:
        raise RuntimeError(
            f"Expected 120 unique model-task traces, found {len(canonical_catalog)}"
        )

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        records = list(pool.map(lambda trace: analyze_trace(base_url, trace), canonical_catalog))
    records.sort(key=lambda record: int(record["trace_number"]))

    # Task type is a property of the task, not the model run. Repair the two
    # inconsistent source labels by taking the modal label across four models.
    canonical_task_types = {}
    for task_id in {record["task_id"] for record in records}:
        labels = [record["task_type"] for record in records if record["task_id"] == task_id]
        canonical_task_types[task_id] = Counter(labels).most_common(1)[0][0]
    for record in records:
        source_task_type = record["task_type"]
        record["task_type"] = canonical_task_types[record["task_id"]]
        if source_task_type != record["task_type"]:
            record["source_task_type"] = source_task_type

    output = {
        "schema_version": "1.0",
        "classifier_version": "work-modes-v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(records),
        "source_count": len(catalog),
        "excluded_duplicate_count": len(excluded_duplicates),
        "excluded_duplicates": excluded_duplicates,
        "cohort": {
            "name": "canonical-trial-one",
            "selection": "First catalog entry for each unique model and task ID pair.",
            "expected_design": "30 tasks × 4 models",
        },
        "method": {
            "gui": "GUI manipulation plus desktop screenshot and desktop wait rounds.",
            "offscreen": "Shell, Python, file, and browser-script rounds; off-screen wins for mixed rounds.",
            "ratio": "Off-screen rounds divided by GUI plus off-screen rounds; neutral rounds are excluded.",
            "first_position": "One-based first off-screen round divided by all model rounds in the trace.",
            "actions": "Count of individual requested actions across model-message rounds, excluding final answers.",
            "task_type": "Modal task-type label across the four model traces for each task ID.",
            "aggregation": "Table values and stacked bars are arithmetic means across traces; missing task scores are excluded, never converted to zero.",
        },
        "traces": records,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(records)} traces to {args.output}")


if __name__ == "__main__":
    main()
