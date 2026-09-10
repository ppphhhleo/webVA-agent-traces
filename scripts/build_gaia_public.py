#!/usr/bin/env python3
"""Build a structurally useful, text-free public sample of GAIA traces.

The source archive contains benchmark questions, answers, observations, and model
reasoning. None of those fields are copied. The output keeps only the action
sequence and aggregate metadata needed to compare interaction strategies.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
from collections import Counter, defaultdict
from pathlib import Path


MODEL_LABELS = {
    "litellm_proxy/openai/gpt-5.4": ("gpt54", "GPT-5.4"),
    "litellm_proxy/openai/gpt-5.5": ("gpt55", "GPT-5.5"),
    "litellm_proxy/anthropic/claude-opus-4-8": ("opus48", "Claude Opus 4.8"),
    "litellm_proxy/anthropic/claude-sonnet-4-6": ("sonnet46", "Claude Sonnet 4.6"),
}

ON_SCREEN = {
    "goto",
    "browser_get_content",
    "click",
    "left_click",
    "right_click",
    "double_click",
    "type",
    "scroll",
    "screenshot",
    "browser_list_tabs",
    "browser_action",
}
OFF_SCREEN = {
    "shell",
    "read_file",
    "write_file",
    "web_search",
    "mcp_tool",
    "task_tracker",
    "run_python",
    "python",
}
NEUTRAL = {"final_answer"}

FORBIDDEN_KEYS = {
    "task",
    "task_prompt",
    "question",
    "final",
    "final_answer",
    "answer",
    "ground_truth",
    "model_answer",
    "model_answer_raw",
    "review",
    "think",
    "reasoning",
    "user",
    "raw",
    "obs",
    "observation",
    "source_path",
    "source_id",
    "cost_usd",
    "gaia_instance_id",
    "gaia_file_name",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--viewer-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--tasks-per-model", type=int, default=30)
    parser.add_argument(
        "--level-quotas",
        default="",
        metavar="LEVEL=N,...",
        help="Use exact GAIA-level quotas instead of proportional sampling (for example, 1=10,2=10,3=10).",
    )
    parser.add_argument("--seed", type=int, default=20260906)
    return parser.parse_args()


def read_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def allocate_quotas(counts: dict[str, int], total: int) -> dict[str, int]:
    available = sum(counts.values())
    exact = {level: total * count / available for level, count in counts.items()}
    quotas = {level: min(counts[level], int(value)) for level, value in exact.items()}
    remaining = total - sum(quotas.values())
    order = sorted(counts, key=lambda level: (exact[level] - int(exact[level]), counts[level]), reverse=True)
    while remaining:
        changed = False
        for level in order:
            if quotas[level] < counts[level]:
                quotas[level] += 1
                remaining -= 1
                changed = True
                if not remaining:
                    break
        if not changed:
            raise ValueError("Unable to allocate the requested sample across GAIA levels")
    return quotas


def parse_level_quotas(spec: str, counts: dict[str, int], total: int) -> dict[str, int]:
    quotas: dict[str, int] = {}
    for item in spec.split(","):
        item = item.strip()
        if not item:
            continue
        try:
            level, raw_quota = item.split("=", 1)
            quota = int(raw_quota)
        except (ValueError, TypeError) as exc:
            raise ValueError(f"Invalid level quota {item!r}; expected LEVEL=N") from exc
        level = level.strip()
        if not level or quota < 0 or level in quotas:
            raise ValueError(f"Invalid level quota {item!r}")
        quotas[level] = quota

    if sum(quotas.values()) != total:
        raise ValueError(
            f"Exact level quotas sum to {sum(quotas.values())}, but --tasks-per-model is {total}"
        )
    missing = set(counts) - set(quotas)
    extra = set(quotas) - set(counts)
    if missing or extra:
        raise ValueError(
            f"Exact level quotas must match available levels; missing={sorted(missing)}, extra={sorted(extra)}"
        )
    insufficient = {
        level: {"requested": quota, "available": counts[level]}
        for level, quota in quotas.items()
        if quota > counts[level]
    }
    if insufficient:
        raise ValueError(f"Insufficient shared tasks for exact level quotas: {insufficient}")
    return quotas


def work_mode(action_types: list[str]) -> str:
    lowered = {value.lower() for value in action_types}
    if lowered & OFF_SCREEN:
        return "offscreen"
    if lowered & ON_SCREEN:
        return "onscreen"
    if lowered and lowered <= NEUTRAL:
        return "neutral"
    return "neutral"


def safe_channel(value: object) -> str:
    channel = str(value or "unknown").lower()
    if channel in {"browser", "web", "terminal", "analysis", "final"}:
        return channel
    return "other"


def sanitize_rounds(viewer_trace: dict) -> list[dict]:
    rounds = []
    for step in viewer_trace.get("steps", []):
        acts = step.get("acts") or []
        if not acts:
            continue
        actions = []
        for act in acts:
            action_type = str(act.get("type") or "unknown").lower()
            actions.append(
                {
                    "type": action_type,
                    "channel": safe_channel(act.get("ch")),
                    "has_error": bool(act.get("err")),
                }
            )
        types = [action["type"] for action in actions]
        rounds.append(
            {
                "round": len(rounds) + 1,
                "source_step": int(step.get("i", len(rounds))),
                "work_mode": work_mode(types),
                "actions": actions,
            }
        )
    return rounds


def contains_forbidden_key(value: object) -> str | None:
    if isinstance(value, dict):
        for key, child in value.items():
            if key.lower() in FORBIDDEN_KEYS:
                return key
            found = contains_forbidden_key(child)
            if found:
                return found
    elif isinstance(value, list):
        for child in value:
            found = contains_forbidden_key(child)
            if found:
                return found
    return None


def main() -> None:
    args = parse_args()
    index_path = args.source_root / "trajectory_run_index.csv"
    trajectory_root = args.source_root / "trajectories"
    viewer_trace_root = args.viewer_root / "traces"

    with index_path.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))

    rows_by_task: dict[str, list[dict]] = defaultdict(list)
    task_metadata: dict[str, dict] = {}
    for row in rows:
        rows_by_task[row["task_id"]].append(row)
        if row["task_id"] not in task_metadata:
            trajectory = read_json(trajectory_root / row["entry_id"] / "trajectory.json")
            external = trajectory.get("external") or {}
            task_metadata[row["task_id"]] = {
                "level": str(external.get("gaia_level") or "Unknown"),
                "has_attachment": bool(external.get("gaia_file_name")),
            }

    expected_models = set(MODEL_LABELS)
    common_tasks = [
        task_id
        for task_id, task_rows in rows_by_task.items()
        if {row["model"] for row in task_rows} == expected_models
    ]
    if len(common_tasks) < args.tasks_per_model:
        raise ValueError(f"Only {len(common_tasks)} tasks are shared by all four models")

    tasks_by_level: dict[str, list[str]] = defaultdict(list)
    for task_id in common_tasks:
        tasks_by_level[task_metadata[task_id]["level"]].append(task_id)
    level_counts = {level: len(task_ids) for level, task_ids in tasks_by_level.items()}
    quotas = (
        parse_level_quotas(args.level_quotas, level_counts, args.tasks_per_model)
        if args.level_quotas
        else allocate_quotas(level_counts, args.tasks_per_model)
    )

    rng = random.Random(args.seed)
    selected_task_ids = []
    for level in sorted(tasks_by_level, key=lambda value: (value == "Unknown", value)):
        selected_task_ids.extend(rng.sample(sorted(tasks_by_level[level]), quotas[level]))
    rng.shuffle(selected_task_ids)

    # Numbering is the only public task identifier. It is deliberately unrelated
    # to the benchmark UUID and stable for a fixed seed/source set.
    public_task_number = {task_id: index + 1 for index, task_id in enumerate(selected_task_ids)}
    selected_rows = [row for row in rows if row["task_id"] in public_task_number]
    selected_rows.sort(key=lambda row: (public_task_number[row["task_id"]], MODEL_LABELS[row["model"]][0]))

    output_traces = args.output_dir / "traces"
    output_traces.mkdir(parents=True, exist_ok=True)
    catalog_entries = []
    sensitive_ids = set(selected_task_ids)

    for row in selected_rows:
        model_key, model_label = MODEL_LABELS[row["model"]]
        task_number = public_task_number[row["task_id"]]
        public_id = f"gaia-{task_number:02d}-{model_key}"
        viewer_trace = read_json(viewer_trace_root / f"{row['entry_id']}.json")
        rounds = sanitize_rounds(viewer_trace)
        counts = Counter(item["work_mode"] for item in rounds)
        working = counts["onscreen"] + counts["offscreen"]
        offscreen_ratio = counts["offscreen"] / working if working else 0
        first_offscreen = next((item["round"] for item in rounds if item["work_mode"] == "offscreen"), None)

        trace = {
            "schema_version": 1,
            "id": public_id,
            "task_number": task_number,
            "benchmark": "GAIA",
            "level": task_metadata[row["task_id"]]["level"],
            "has_attachment": task_metadata[row["task_id"]]["has_attachment"],
            "model_key": model_key,
            "model": model_label,
            "success": row["success"].lower() == "true",
            "score": float(row["score"]),
            "tokens": {"input": int(row["tokens_in"] or 0), "output": int(row["tokens_out"] or 0)},
            "summary": {
                "rounds": len(rounds),
                "actions": sum(len(item["actions"]) for item in rounds),
                "onscreen_rounds": counts["onscreen"],
                "offscreen_rounds": counts["offscreen"],
                "neutral_rounds": counts["neutral"],
                "offscreen_ratio": round(offscreen_ratio, 6),
                "first_offscreen_round": first_offscreen,
            },
            "rounds": rounds,
            "redaction": {
                "task_text": "withheld",
                "answers": "withheld",
                "reasoning_and_observations": "withheld",
                "screenshots": "not_published",
            },
        }
        forbidden = contains_forbidden_key(trace)
        if forbidden:
            raise ValueError(f"Forbidden key {forbidden!r} in {public_id}")
        serialized = json.dumps(trace, ensure_ascii=False)
        if any(task_id in serialized for task_id in sensitive_ids):
            raise ValueError(f"Source task identifier leaked into {public_id}")
        (output_traces / f"{public_id}.json").write_text(
            json.dumps(trace, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        catalog_entries.append(
            {
                "id": public_id,
                "task_number": task_number,
                "benchmark": "GAIA",
                "level": trace["level"],
                "has_attachment": trace["has_attachment"],
                "model_key": model_key,
                "model": model_label,
                "success": trace["success"],
                "score": trace["score"],
                "rounds": len(rounds),
                "data_path": f"traces/{public_id}.json",
            }
        )

    model_counts = Counter(item["model"] for item in catalog_entries)
    if set(model_counts.values()) != {args.tasks_per_model}:
        raise ValueError(f"Unexpected per-model counts: {dict(model_counts)}")

    selection_fingerprint = hashlib.sha256("\n".join(selected_task_ids).encode()).hexdigest()[:12]
    catalog = {
        "schema_version": 1,
        "benchmark": "GAIA",
        "sample": {
            "tasks": args.tasks_per_model,
            "traces": len(catalog_entries),
            "seed": args.seed,
            "selection_fingerprint": selection_fingerprint,
            "paired_across_models": True,
            "level_quotas": quotas,
        },
        "models": [label for _, label in MODEL_LABELS.values()],
        "traces": catalog_entries,
        "public_content": "Action structure and aggregate metadata only; benchmark content is withheld.",
    }
    (args.output_dir / "catalog.json").write_text(
        json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(json.dumps({"traces": len(catalog_entries), "per_model": model_counts, "levels": quotas}, indent=2))


if __name__ == "__main__":
    main()
