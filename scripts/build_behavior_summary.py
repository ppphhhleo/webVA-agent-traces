#!/usr/bin/env python3
"""Build the compact, public behavior matrix datasource.

The source annotation file remains the episode-level record in S3/local storage.
This derivative contains only aggregate counts and percentages needed by the
GitHub Pages analysis and publication figures.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


MODEL_ORDER = ["GPT-5.4", "GPT-5.5", "Claude Opus 4.8", "Claude Sonnet 5"]
TASK_TYPE_ORDER = ["Low-level", "Compound", "High-level"]
THEME_ORDER = [
    "Interpreting the task",
    "Working on the screen",
    "Switching channels",
    "Working off the screen",
    "Delivering the answers",
]


def percentage(numerator: int, denominator: int) -> float:
    return round(100.0 * numerator / denominator, 4) if denominator else 0.0


def build_summary(coded: dict[str, Any]) -> dict[str, Any]:
    annotations = coded["annotations"]
    trace_index = coded["trace_index"]
    taxonomy = {item["theme"]: item for item in coded["taxonomy"]}

    trace_ids_by_model: dict[str, set[str]] = defaultdict(set)
    trace_ids_by_model_and_task_type: dict[tuple[str, str], set[str]] = defaultdict(set)
    for trace in trace_index:
        trace_ids_by_model[trace["model"]].add(trace["trace_id"])
        trace_ids_by_model_and_task_type[(trace["model"], trace["task_type"])].add(trace["trace_id"])

    episode_totals = Counter(annotation["model"] for annotation in annotations)
    episode_counts: Counter[tuple[str, str]] = Counter(
        (annotation["model"], annotation["code"]) for annotation in annotations
    )
    traces_by_code: dict[tuple[str, str], set[str]] = defaultdict(set)
    traces_by_code_and_task_type: dict[tuple[str, str, str], set[str]] = defaultdict(set)
    for annotation in annotations:
        traces_by_code[(annotation["model"], annotation["code"])].add(annotation["trace_id"])
        traces_by_code_and_task_type[
            (annotation["model"], annotation["code"], annotation["task_type"])
        ].add(annotation["trace_id"])

    models = []
    for model in MODEL_ORDER:
        trace_count = len(trace_ids_by_model[model])
        episode_count = episode_totals[model]
        if not trace_count or not episode_count:
            raise RuntimeError(f"Missing behavior data for {model}")
        models.append({
            "model": model,
            "trace_count": trace_count,
            "episode_count": episode_count,
            "task_types": [
                {
                    "task_type": task_type,
                    "trace_count": len(trace_ids_by_model_and_task_type[(model, task_type)]),
                }
                for task_type in TASK_TYPE_ORDER
            ],
        })

    themes = []
    for theme_name in THEME_ORDER:
        theme = taxonomy[theme_name]
        behaviors = []
        for item in theme["codes"]:
            code = item["code"]
            model_metrics = []
            for model in MODEL_ORDER:
                episode_count = episode_counts[(model, code)]
                trace_count = len(traces_by_code[(model, code)])
                task_type_metrics = []
                for task_type in TASK_TYPE_ORDER:
                    task_trace_count = len(
                        traces_by_code_and_task_type[(model, code, task_type)]
                    )
                    task_denominator = len(
                        trace_ids_by_model_and_task_type[(model, task_type)]
                    )
                    task_type_metrics.append({
                        "task_type": task_type,
                        "trace_count": task_trace_count,
                        "share_of_model_traces_percent": percentage(
                            task_trace_count, len(trace_ids_by_model[model])
                        ),
                        "prevalence_within_task_type_percent": percentage(
                            task_trace_count, task_denominator
                        ),
                    })
                model_metrics.append({
                    "model": model,
                    "episode_count": episode_count,
                    "episode_share_percent": percentage(episode_count, episode_totals[model]),
                    "trace_count": trace_count,
                    "trace_prevalence_percent": percentage(trace_count, len(trace_ids_by_model[model])),
                    "task_types": task_type_metrics,
                })
            behaviors.append({
                "code": code,
                "episode_count": sum(metric["episode_count"] for metric in model_metrics),
                "models": model_metrics,
            })
        themes.append({
            "theme": theme_name,
            "episode_count": sum(behavior["episode_count"] for behavior in behaviors),
            "behaviors": behaviors,
        })

    model_episode_sum = sum(model["episode_count"] for model in models)
    theme_episode_sum = sum(theme["episode_count"] for theme in themes)
    if model_episode_sum != len(annotations) or theme_episode_sum != len(annotations):
        raise RuntimeError("Behavior summary totals do not reconcile with source annotations")

    return {
        "schema_version": "1.1",
        "classifier_version": "behavior-summary-v2-task-type-prevalence",
        "source": {
            "dataset": coded.get("dataset"),
            "generated_at": coded.get("generated_at"),
            "workbook_filename": coded.get("source", {}).get("workbook_filename"),
            "workbook_sha256": coded.get("source", {}).get("workbook_sha256"),
            "sheet": coded.get("source", {}).get("sheet"),
        },
        "counts": {
            "traces": len(trace_index),
            "models": len(models),
            "themes": len(themes),
            "behaviors": sum(len(theme["behaviors"]) for theme in themes),
            "episodes": len(annotations),
        },
        "definitions": {
            "episode_share_percent": "Behavior episodes divided by all coded episodes for the model.",
            "trace_prevalence_percent": "Distinct traces containing the behavior divided by all traces for the model.",
            "share_of_model_traces_percent": "Distinct traces in one task type containing the behavior divided by all traces for the model; task-type shares stack to total trace prevalence.",
            "prevalence_within_task_type_percent": "Distinct traces containing the behavior divided by traces of that task type for the model.",
        },
        "models": models,
        "themes": themes,
    }


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--annotations",
        type=Path,
        default=root / "data" / "annotations" / "agent_behaviors_trial1.json",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=root / "analysis" / "behavior_summary.json",
    )
    args = parser.parse_args()

    coded = json.loads(args.annotations.read_text(encoding="utf-8"))
    summary = build_summary(coded)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"Wrote {args.output}: {summary['counts']['behaviors']} behaviors, "
        f"{summary['counts']['episodes']} episodes, {summary['counts']['traces']} traces"
    )


if __name__ == "__main__":
    main()
