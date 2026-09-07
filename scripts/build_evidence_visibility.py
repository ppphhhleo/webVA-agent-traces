#!/usr/bin/env python3
"""Build trace-level evidence-faithfulness and action-visibility data."""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

from build_analysis_data import analyze_trace, fetch_json


EVIDENCE_ORDER = [
    "No delivered evidence",
    "Fabricated evidence",
    "Misgrounded evidence",
    "Prior knowledge only",
    "Computed evidence",
    "Visual + prior knowledge",
    "Grounded visual evidence",
    "Computed + visual evidence",
]


def classify_evidence(annotations: list[dict[str, Any]]) -> str:
    """Resolve delivery annotations to one ordered, mutually exclusive category."""
    codes = {annotation["code"] for annotation in annotations}
    if any(code.startswith("No delivery:") for code in codes):
        return "No delivered evidence"
    if "Fabricated evidence" in codes:
        return "Fabricated evidence"
    if "Misgrounded evidence" in codes:
        return "Misgrounded evidence"
    if "Computed and visually established evidence" in codes:
        return "Computed + visual evidence"
    if {
        "Grounded in-app visual evidence",
        "Prior-knowledge substitution or generalization",
    }.issubset(codes):
        return "Visual + prior knowledge"
    if "Grounded in-app visual evidence" in codes:
        return "Grounded visual evidence"
    if "Computed evidence" in codes:
        return "Computed evidence"
    if "Prior-knowledge substitution or generalization" in codes:
        return "Prior knowledge only"
    return "No delivered evidence"


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--metrics",
        type=Path,
        default=root / "analysis" / "data.json",
    )
    parser.add_argument(
        "--annotations",
        type=Path,
        default=root / "data" / "annotations" / "agent_behaviors_trial1.json",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=root / "analysis" / "evidence_visibility.json",
    )
    parser.add_argument(
        "--base-url",
        default="https://agent-traces-collection.s3.us-west-2.amazonaws.com/data/",
    )
    args = parser.parse_args()

    metrics = json.loads(args.metrics.read_text(encoding="utf-8"))
    coded = json.loads(args.annotations.read_text(encoding="utf-8"))
    delivery_by_trace: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for annotation in coded["annotations"]:
        if annotation["theme"] == "Delivering the answers":
            delivery_by_trace[annotation["trace_id"]].append(annotation)
    metric_by_trace = {trace["trace_id"]: trace for trace in metrics["traces"]}
    coded_trace_ids = {trace["trace_id"] for trace in coded["trace_index"]}
    missing_metric_ids = coded_trace_ids - set(metric_by_trace)
    supplemented_metrics = []
    if missing_metric_ids:
        base_url = args.base_url.rstrip("/") + "/"
        catalog = fetch_json(urljoin(base_url, "catalog.json"))["traces"]
        catalog_by_trace = {trace["trace_id"]: trace for trace in catalog}
        for trace_id in sorted(missing_metric_ids):
            if trace_id not in catalog_by_trace:
                raise RuntimeError(f"Coded trace {trace_id} is missing from the public catalog")
            supplement = analyze_trace(base_url, catalog_by_trace[trace_id])
            metric_by_trace[trace_id] = supplement
            supplemented_metrics.append(trace_id)

    records = []
    for indexed_trace in coded["trace_index"]:
        trace_id = indexed_trace["trace_id"]
        trace = metric_by_trace[trace_id]
        delivery = delivery_by_trace.get(trace_id, [])
        if not delivery:
            raise RuntimeError(f"Coded trace {trace_id} has no delivery-evidence annotation")
        evidence = classify_evidence(delivery)
        level = EVIDENCE_ORDER.index(evidence)
        records.append({
            "trace_number": indexed_trace["trace_number"],
            "trace_id": trace_id,
            "task_id": indexed_trace["task_id"],
            "task_type": indexed_trace["task_type"],
            "task_prompt": indexed_trace["task_prompt"],
            "model": indexed_trace["model"],
            "app": indexed_trace.get("app"),
            "completion_status": trace["completion_status"],
            "task_score": trace["task_score"],
            "gui_percent": trace["gui_percent"],
            "offscreen_percent": trace["offscreen_percent"],
            "evidence_category": evidence,
            "evidence_level": level,
            "evidence_percent": round(level / (len(EVIDENCE_ORDER) - 1) * 100, 2),
            "evidence_rounds": sorted({
                annotation["round_reference"]["raw"] for annotation in delivery
            }),
        })
    records.sort(key=lambda record: int(record["trace_number"]))
    if len(records) != 120:
        raise RuntimeError(f"Expected 120 canonical traces, found {len(records)}")

    output = {
        "schema_version": "1.0",
        "classifier_version": "evidence-visibility-v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(records),
        "cohort": {
            "name": "coded-agent-traces-trial-one",
            "selection": "The 120 unique traces in the behavioral-coding trace index.",
            "supplemented_metrics": supplemented_metrics,
            "note": "Metrics for coded replacement traces absent from the first-entry analysis cohort are derived from their public trajectories.",
        },
        "evidence_order": EVIDENCE_ORDER,
        "category_counts": dict(Counter(record["evidence_category"] for record in records)),
        "method": {
            "visibility": "GUI rounds divided by GUI plus off-screen working rounds; neutral rounds are excluded.",
            "evidence": "One mutually exclusive delivery-evidence category is derived from the coded delivery annotations. Traces with both visual and prior-knowledge codes form a combined category.",
            "vertical_scale": "The evidence categories form an explicit descriptive ordinal scale from no delivered evidence to combined computed and visual evidence. It is not an answer-correctness score.",
            "aggregation": "Large dots are model means. Translucent ellipses are 95% bivariate confidence regions for the model mean, computed from unjittered trace positions.",
        },
        "traces": records,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"count": len(records), "categories": output["category_counts"]}, indent=2))


if __name__ == "__main__":
    main()
