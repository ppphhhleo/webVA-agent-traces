#!/usr/bin/env python3
"""Build a trace-level engineering-error handling flow for the analysis page."""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

from build_analysis_data import fetch_json


ERROR_ORDER = [
    "Missing dependency / environment",
    "Data source / access",
    "Parsing / computation",
    "Command / search",
]

HANDLING_ORDER = [
    "Repaired code / parser",
    "Changed source / endpoint",
    "Adapted environment / method",
    "Returned to GUI",
    "Finished without recovery",
    "Unresolved / abandoned",
]

LANDING_ORDER = [
    "Grounded visual evidence",
    "Combined visual + computed",
    "Computed evidence",
    "Prior-knowledge answer",
    "Misgrounded evidence",
    "Fabricated evidence",
    "No answer",
]

LANDING_LABELS = {
    "No delivery: answer never obtained": "No answer",
    "No delivery: answer rendered but never read": "No answer",
    "No delivery: answer obtained but never committed": "No answer",
    "Fabricated evidence": "Fabricated evidence",
    "Misgrounded evidence": "Misgrounded evidence",
    "Computed and visually established evidence": "Combined visual + computed",
    "Computed evidence": "Computed evidence",
    "Grounded in-app visual evidence": "Grounded visual evidence",
    "Prior-knowledge substitution or generalization": "Prior-knowledge answer",
}

# One bundle-inspection output contains source-code strings such as ``error:``
# but no executed command failed. It was manually checked and excluded.
FALSE_POSITIVE_TRACE_IDS = {"tr_aee13c5d7b73c83c"}

TRACE_ERROR_CLASS_OVERRIDES = {
    # The first weak match is bundle text; the consequential failure is a
    # missing local analysis dependency.
    "tr_424243bfa9d320a5": "Missing dependency / environment",
}

STRONG_ERROR = re.compile(
    r"traceback \(most recent call last\)|"
    r"module(?:notfound|notfounderror)|importerror:|syntaxerror:|"
    r"attributeerror:|keyerror:|indexerror:|typeerror:|valueerror:|"
    r"zerodivisionerror:|filenotfounderror:|permissionerror:|"
    r"jsondecodeerror:|subprocess\.calledprocesserror|"
    r"command (?:failed|timed out)|unmatched \(|no such file or directory|"
    r"npm err!|error: unable",
    re.I,
)
HTTP_ERROR = re.compile(
    r"(?:\b(?:err|fail)\b[^\n]{0,100})?\bhttp error [45]\d\d\b|"
    r"\b(?:err|fail)\b[^\n]{0,100}\b[45]\d\d\b|"
    r"urlerror|connectionerror",
    re.I,
)


def action_type(event: dict[str, Any]) -> str:
    action = event.get("data", {}).get("action") or {}
    return str(action.get("type") or "").lower()


def error_strength(event: dict[str, Any]) -> int:
    data = event.get("data", {})
    if event.get("event_type") != "tool_call":
        return 0
    kind = action_type(event)
    if "shell" not in kind and "python" not in kind:
        return 0
    if data.get("ok") is False or str(data.get("error") or "").strip():
        return 3
    output = str(data.get("output") or "")
    if STRONG_ERROR.search(output):
        return 3
    if HTTP_ERROR.search(output):
        return 2
    return 0


def error_events(trace: dict[str, Any]) -> list[dict[str, Any]]:
    found = []
    for event in trace.get("events", []):
        strength = error_strength(event)
        if strength:
            data = event.get("data", {})
            found.append({
                "round": int(data.get("round_index") or event.get("step_index") or 0),
                "strength": strength,
                "action_type": action_type(event),
                "output": str(data.get("error") or data.get("output") or ""),
            })
    return found


def classify_error(found: list[dict[str, Any]], trace_id: str) -> tuple[str, dict[str, Any]]:
    if trace_id in TRACE_ERROR_CLASS_OVERRIDES:
        strongest = max(found, key=lambda item: (item["strength"], -item["round"]))
        return TRACE_ERROR_CLASS_OVERRIDES[trace_id], strongest
    strongest_level = max(item["strength"] for item in found)
    first = min((item for item in found if item["strength"] == strongest_level), key=lambda item: item["round"])
    text = first["output"].lower()
    if re.search(r"modulenotfound|importerror|no module named|pip (?:install|list)|permissionerror", text):
        return "Missing dependency / environment", first
    if re.search(r"http error|urlerror|connectionerror|404|403|no such file|filenotfound", text):
        return "Data source / access", first
    if re.search(r"attributeerror|keyerror|indexerror|typeerror|valueerror|zerodivision|syntaxerror|jsondecode|nonetype", text):
        return "Parsing / computation", first
    return "Command / search", first


def classify_recovery(detail: str) -> str:
    text = detail.lower()
    if re.search(r"parser|request|datapoint key|script|urllib|attribute|wrong-artifact", text):
        return "Repaired code / parser"
    if re.search(r"url|source|remote|dataset|fetch|discover|locat|resource|bundle", text):
        return "Changed source / endpoint"
    if re.search(r"module|pandas|dependency|environment|stdlib|standard-library|manual correlation|unsupported|install", text):
        return "Adapted environment / method"
    return "Repaired code / parser"


def classify_landing(annotations: list[dict[str, Any]]) -> str:
    codes = {
        annotation["code"]
        for annotation in annotations
        if annotation.get("theme") == "Delivering the answers"
    }
    for code in LANDING_LABELS:
        if code in codes:
            return LANDING_LABELS[code]
    return "No answer"


def classify_handling(annotations: list[dict[str, Any]], landing: str, trace_id: str) -> tuple[str, str]:
    recoveries = [annotation for annotation in annotations if annotation.get("code") == "Code error recovery"]
    if recoveries:
        detail = " ".join(str(annotation.get("detail") or "") for annotation in recoveries)
        return classify_recovery(detail), detail
    forced = [annotation for annotation in annotations if annotation.get("code") == "Forced return to GUI"]
    if forced:
        return "Returned to GUI", " ".join(str(annotation.get("detail") or "") for annotation in forced)
    stalled = [annotation for annotation in annotations if annotation.get("code") == "Stalled engineering"]
    if landing == "No answer":
        detail = " ".join(str(annotation.get("detail") or "") for annotation in stalled)
        return "Unresolved / abandoned", detail or "Engineering work ended without a delivered answer."
    detail = " ".join(str(annotation.get("detail") or "") for annotation in stalled)
    return "Finished without recovery", detail or "The trace completed without a coded recovery of the engineering failure."


def aggregate_links(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        for source_stage, target_stage in (("error", "handling"), ("handling", "landing")):
            grouped[(source_stage, record[source_stage], target_stage, record[target_stage])].append(record)
    return [
        {
            "source_stage": source_stage,
            "source": source,
            "target_stage": target_stage,
            "target": target,
            "count": len(linked),
            "episode_ids": [record["episode_id"] for record in linked],
            "trace_ids": sorted(record["trace_id"] for record in linked),
        }
        for (source_stage, source, target_stage, target), linked in grouped.items()
    ]


def load_trace(
    trace_id: str,
    trace_dir: Path | None,
    base_url: str,
    trajectory_urls: dict[str, str],
) -> dict[str, Any]:
    if trace_dir:
        return json.loads((trace_dir / f"{trace_id}.json").read_text(encoding="utf-8"))
    if trace_id not in trajectory_urls:
        raise RuntimeError(f"Trace {trace_id} is missing from the public catalog")
    return fetch_json(urljoin(base_url.rstrip("/") + "/", trajectory_urls[trace_id]))


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument("--metrics", type=Path, default=root / "analysis" / "data.json")
    parser.add_argument(
        "--annotations",
        type=Path,
        default=root / "data" / "annotations" / "agent_behaviors_trial1.json",
    )
    parser.add_argument("--output", type=Path, default=root / "analysis" / "code_error_flow.json")
    parser.add_argument(
        "--csv-output",
        type=Path,
        default=root / "analysis" / "code_error_flow.csv",
        help="Write a flat, one-row-per-error-bearing-trace companion dataset.",
    )
    parser.add_argument("--trace-dir", type=Path)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument(
        "--base-url",
        default="https://agent-traces-collection.s3.us-west-2.amazonaws.com/data/",
    )
    args = parser.parse_args()

    metrics = json.loads(args.metrics.read_text(encoding="utf-8"))
    source = json.loads(args.annotations.read_text(encoding="utf-8"))
    trajectory_urls: dict[str, str] = {}
    if not args.trace_dir:
        catalog = fetch_json(urljoin(args.base_url.rstrip("/") + "/", "catalog.json"))
        trajectory_urls = {
            trace["trace_id"]: trace["trajectory_url"]
            for trace in catalog["traces"]
        }
    metric_records = [
        metric for metric in metrics["traces"]
        if metric["trace_id"] not in FALSE_POSITIVE_TRACE_IDS
    ]
    if args.trace_dir:
        traces = {
            metric["trace_id"]: load_trace(
                metric["trace_id"], args.trace_dir, args.base_url, trajectory_urls
            )
            for metric in metric_records
        }
    else:
        with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
            loaded = executor.map(
                lambda metric: load_trace(
                    metric["trace_id"], None, args.base_url, trajectory_urls
                ),
                metric_records,
            )
            traces = {
                metric["trace_id"]: trace
                for metric, trace in zip(metric_records, loaded)
            }
    by_trace: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for annotation in source["annotations"]:
        by_trace[annotation["trace_id"]].append(annotation)

    records = []
    for metric in metric_records:
        trace_id = metric["trace_id"]
        trace = traces[trace_id]
        found = error_events(trace)
        if not found:
            continue
        annotations = by_trace.get(trace_id, [])
        error_class, first_error = classify_error(found, trace_id)
        landing = classify_landing(annotations)
        handling, handling_detail = classify_handling(annotations, landing, trace_id)
        excerpt = re.sub(r"\s+", " ", first_error["output"]).strip()[:240]
        records.append({
            "episode_id": f"engineering-error:{trace_id}",
            "trace_id": trace_id,
            "trace_number": metric["trace_number"],
            "model": metric["model"],
            "app": metric.get("app"),
            "task_id": metric["task_id"],
            "task_type": metric["task_type"],
            "error": error_class,
            "error_round": first_error["round"],
            "error_count": len(found),
            "error_excerpt": excerpt,
            "handling": handling,
            "handling_detail": handling_detail,
            "landing": landing,
        })

    records.sort(key=lambda record: int(record["trace_number"]))
    stage_orders = {"error": ERROR_ORDER, "handling": HANDLING_ORDER, "landing": LANDING_ORDER}
    stage_counts = {
        stage: dict(Counter(record[stage] for record in records))
        for stage in stage_orders
    }
    code_recovered = sum(record["handling"] in HANDLING_ORDER[:3] for record in records)
    returned_to_gui = sum(record["handling"] == "Returned to GUI" for record in records)
    unrecovered = sum(record["handling"] in HANDLING_ORDER[-2:] for record in records)
    output = {
        "schema_version": "1.0",
        "classifier_version": "engineering-error-flow-v1-trace-consolidated",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": {
            "dataset": source.get("dataset"),
            "workbook_filename": source.get("source", {}).get("workbook_filename"),
            "workbook_sha256": source.get("source", {}).get("workbook_sha256"),
            "sheet": source.get("source", {}).get("sheet"),
        },
        "method": {
            "unit": "Each error-bearing trace contributes one flow. Repeated engineering errors within a trace are consolidated so long traces do not dominate.",
            "error": "The first strongest explicit shell/Python failure is classified into four descriptive error families; one manually checked source-code false positive is excluded.",
            "handling": "Audited Code error recovery, Forced return to GUI, and Stalled engineering annotations determine recovery. Traces without a coded recovery are separated into completed and unresolved outcomes.",
            "landing": "The trace's mutually exclusive coded delivery-evidence category.",
        },
        "counts": {
            "error_traces": len(records),
            "code_recovered": code_recovered,
            "returned_to_gui": returned_to_gui,
            "unrecovered_or_unresolved": unrecovered,
        },
        "stage_orders": stage_orders,
        "stage_counts": stage_counts,
        "links": aggregate_links(records),
        "episodes": records,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    csv_fields = [
        "episode_id",
        "trace_id",
        "trace_number",
        "model",
        "app",
        "task_id",
        "task_type",
        "error",
        "error_round",
        "error_count",
        "error_excerpt",
        "handling",
        "handling_detail",
        "landing",
    ]
    args.csv_output.parent.mkdir(parents=True, exist_ok=True)
    with args.csv_output.open("w", encoding="utf-8", newline="") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=csv_fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(records)
    print(json.dumps({
        "counts": output["counts"],
        "stages": stage_counts,
        "json_output": str(args.output),
        "csv_output": str(args.csv_output),
    }, indent=2))


if __name__ == "__main__":
    main()
