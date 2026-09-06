#!/usr/bin/env python3
"""Build the private, full-content companion to the public GAIA sample.

This output contains gated benchmark material. It must only be uploaded to a
private S3 prefix or another authenticated store.
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import shutil
from collections import defaultdict
from pathlib import Path

from build_gaia_public import MODEL_LABELS, allocate_quotas, read_json, work_mode


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--viewer-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--tasks-per-model", type=int, default=30)
    parser.add_argument("--seed", type=int, default=20260906)
    return parser.parse_args()


def parse_raw(value: object) -> object:
    if not isinstance(value, str):
        return value
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def selected_tasks(rows: list[dict], source_root: Path, total: int, seed: int) -> tuple[list[str], dict[str, dict], dict[str, int]]:
    expected_models = set(MODEL_LABELS)
    rows_by_task: dict[str, list[dict]] = defaultdict(list)
    metadata: dict[str, dict] = {}
    for row in rows:
        rows_by_task[row["task_id"]].append(row)
        if row["task_id"] not in metadata:
            trajectory = read_json(source_root / "trajectories" / row["entry_id"] / "trajectory.json")
            external = trajectory.get("external") or {}
            metadata[row["task_id"]] = {
                "level": str(external.get("gaia_level") or "Unknown"),
                "attachment_name": external.get("gaia_file_name") or None,
            }
    common = [task_id for task_id, task_rows in rows_by_task.items() if {row["model"] for row in task_rows} == expected_models]
    by_level: dict[str, list[str]] = defaultdict(list)
    for task_id in common:
        by_level[metadata[task_id]["level"]].append(task_id)
    quotas = allocate_quotas({level: len(task_ids) for level, task_ids in by_level.items()}, total)
    rng = random.Random(seed)
    chosen = []
    for level in sorted(by_level, key=lambda value: (value == "Unknown", value)):
        chosen.extend(rng.sample(sorted(by_level[level]), quotas[level]))
    rng.shuffle(chosen)
    return chosen, metadata, quotas


def copy_screenshots(
    source_root: Path,
    output_dir: Path,
    entry_id: str,
    public_id: str,
    shot_paths: list[str],
) -> list[str]:
    copied = []
    for relative in shot_paths:
        source = source_root / "trajectories" / entry_id / relative
        if not source.is_file():
            continue
        destination = output_dir / "screenshots" / public_id / source.name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        copied.append(f"screenshots/{public_id}/{source.name}")
    return copied


def normalize_steps(
    viewer_trace: dict,
    source_root: Path,
    output_dir: Path,
    entry_id: str,
    public_id: str,
) -> list[dict]:
    rounds = []
    for step in viewer_trace.get("steps", []):
        acts = step.get("acts") or []
        shots = copy_screenshots(source_root, output_dir, entry_id, public_id, step.get("shots") or [])
        if not acts and not step.get("user") and not step.get("think") and not shots:
            continue
        actions = []
        for act in acts:
            actions.append(
                {
                    "type": str(act.get("type") or "unknown").lower(),
                    "channel": act.get("ch") or "unknown",
                    "arguments": parse_raw(act.get("raw")),
                    "observation": act.get("obs") or None,
                    "error": act.get("err") or None,
                }
            )
        rounds.append(
            {
                "round": len(rounds) + 1,
                "source_step": int(step.get("i", len(rounds))),
                "user_message": step.get("user") or None,
                "reasoning": step.get("think") or None,
                "work_mode": work_mode([action["type"] for action in actions]),
                "actions": actions,
                "screenshots": shots,
            }
        )
    return rounds


def main() -> None:
    args = parse_args()
    with (args.source_root / "trajectory_run_index.csv").open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))

    chosen, metadata, quotas = selected_tasks(rows, args.source_root, args.tasks_per_model, args.seed)
    task_number = {task_id: index + 1 for index, task_id in enumerate(chosen)}
    selected_rows = [row for row in rows if row["task_id"] in task_number]
    selected_rows.sort(key=lambda row: (task_number[row["task_id"]], MODEL_LABELS[row["model"]][0]))
    (args.output_dir / "traces").mkdir(parents=True, exist_ok=True)
    catalog_entries = []

    for row in selected_rows:
        model_key, model_label = MODEL_LABELS[row["model"]]
        number = task_number[row["task_id"]]
        public_id = f"gaia-{number:02d}-{model_key}"
        viewer = read_json(args.viewer_root / "traces" / f"{row['entry_id']}.json")
        trajectory = read_json(args.source_root / "trajectories" / row["entry_id"] / "trajectory.json")
        external = trajectory.get("external") or {}
        rounds = normalize_steps(viewer, args.source_root, args.output_dir, row["entry_id"], public_id)
        record = {
            "schema_version": 1,
            "visibility": "private_gated_benchmark_content",
            "id": public_id,
            "source_trace_id": row["entry_id"],
            "source_task_id": row["task_id"],
            "task_number": number,
            "benchmark": "GAIA",
            "level": metadata[row["task_id"]]["level"],
            "attachment_name": metadata[row["task_id"]]["attachment_name"],
            "model_key": model_key,
            "model": model_label,
            "success": row["success"].lower() == "true",
            "score": float(row["score"]),
            "tokens": {"input": int(row["tokens_in"] or 0), "output": int(row["tokens_out"] or 0)},
            "task_prompt": row["task_prompt"],
            "answers": {
                "ground_truth": external.get("ground_truth"),
                "model_answer": external.get("model_answer"),
                "model_answer_raw": external.get("model_answer_raw"),
                "final_answer": external.get("final_answer") or viewer.get("final"),
            },
            "review": viewer.get("review"),
            "rounds": rounds,
        }
        (args.output_dir / "traces" / f"{public_id}.json").write_text(
            json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        catalog_entries.append(
            {
                "id": public_id,
                "source_trace_id": row["entry_id"],
                "source_task_id": row["task_id"],
                "task_number": number,
                "level": record["level"],
                "attachment_name": record["attachment_name"],
                "model_key": model_key,
                "model": model_label,
                "success": record["success"],
                "score": record["score"],
                "rounds": len(rounds),
                "task_prompt": record["task_prompt"],
                "data_path": f"traces/{public_id}.json",
            }
        )

    catalog = {
        "schema_version": 1,
        "visibility": "private_gated_benchmark_content",
        "benchmark": "GAIA",
        "source": "https://huggingface.co/datasets/gaia-benchmark/GAIA",
        "sample": {
            "tasks": args.tasks_per_model,
            "traces": len(catalog_entries),
            "seed": args.seed,
            "paired_across_models": True,
            "level_quotas": quotas,
        },
        "traces": catalog_entries,
    }
    (args.output_dir / "catalog.json").write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    screenshot_count = sum(
        path.is_file()
        for path in ((args.output_dir / "screenshots").rglob("*") if (args.output_dir / "screenshots").exists() else [])
    )
    print(json.dumps({"traces": len(catalog_entries), "screenshots": screenshot_count, "levels": quotas}, indent=2))


if __name__ == "__main__":
    main()
