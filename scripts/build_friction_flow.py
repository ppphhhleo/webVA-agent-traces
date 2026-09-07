#!/usr/bin/env python3
"""Derive auditable GUI-friction episodes for the analysis alluvial chart."""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


FRICTION_LABELS = {
    "Ineffective or misgrounded GUI manipulation": "Misgrounded manipulation",
    "Repeated GUI manipulation": "Repetition loop",
}

RESPONSE_CODES = {
    "GUI self-correction": ("Stayed on screen", "Self-recovery"),
    "On-screen interaction bypass": ("Stayed on screen", "On-screen bypass"),
    "Cycling input routes": ("Stayed on screen", "Alternative input route"),
    "Overlooked interface change": ("Overlooked change", "No repair / assumed state"),
    "Code augmentation of visual": ("Moved off screen", "Code augmentation"),
    "Code retreat after GUI friction": ("Moved off screen", None),
    "Parallel code excursion": ("Moved off screen", None),
    "Forced return to GUI": ("Stayed on screen", "Forced return to GUI"),
    "Visual reconciliation return": ("Stayed on screen", "Visual reconciliation"),
}

OFFSCREEN_MECHANISMS = {
    "Web app inspection": "App inspection",
    "Local search": "Search / fetch",
    "Online fetching and searching": "Search / fetch",
    "Prior-knowledge injection": "Prior knowledge / known source",
    "In-code analysis and production": "In-code analysis",
    "Code error recovery": "Code debugging / environment",
    "Local environment modification": "Code debugging / environment",
    "Stalled engineering": "Stalled engineering",
}

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

LANDING_PRIORITY = list(LANDING_LABELS)
STAGE_ORDERS = {
    "friction": ["Misgrounded manipulation", "Repetition loop"],
    "response": [
        "Stayed on screen",
        "Moved off screen",
        "Overlooked change",
        "Abandoned unresolved",
    ],
    "mechanism": [
        "Self-recovery",
        "Persistent retry / re-aim",
        "Alternative input route",
        "On-screen bypass",
        "Forced return to GUI",
        "Visual reconciliation",
        "Code augmentation",
        "App inspection",
        "Search / fetch",
        "In-code analysis",
        "Prior knowledge / known source",
        "Code debugging / environment",
        "Stalled engineering",
        "Direct code retreat",
        "No repair / assumed state",
        "No repair / task ended",
    ],
    "landing": [
        "Grounded visual evidence",
        "Combined visual + computed",
        "Computed evidence",
        "Prior-knowledge answer",
        "Misgrounded evidence",
        "Fabricated evidence",
        "No answer",
    ],
}


def round_values(annotation: dict[str, Any]) -> list[int]:
    return annotation.get("round_reference", {}).get("rounds") or []


def first_round_at_or_after(annotation: dict[str, Any], threshold: int) -> int | None:
    return next((value for value in round_values(annotation) if value >= threshold), None)


def delivery_landing(annotations: list[dict[str, Any]], friction_start: int) -> str:
    codes = {
        annotation["code"]
        for annotation in annotations
        if annotation["theme"] == "Delivering the answers"
        and first_round_at_or_after(annotation, friction_start) is not None
    }
    for code in LANDING_PRIORITY:
        if code in codes:
            return LANDING_LABELS[code]
    return "No answer"


def response_candidate(
    annotations: list[dict[str, Any]],
    friction: dict[str, Any],
) -> tuple[dict[str, Any] | None, int | None]:
    rounds = round_values(friction)
    friction_start, friction_end = min(rounds), max(rounds)
    strong: list[tuple[int, int, dict[str, Any]]] = []
    fallback: list[tuple[int, int, dict[str, Any]]] = []

    for annotation in annotations:
        if annotation is friction or annotation["code"] in FRICTION_LABELS:
            continue
        if annotation["code"] in RESPONSE_CODES or annotation["theme"] == "Working off the screen":
            response_round = first_round_at_or_after(annotation, friction_start)
            if response_round is not None:
                # Explicit switching/recovery codes outrank their accompanying
                # off-screen detail when both are coded on the same round.
                rank = 0 if annotation["code"] in RESPONSE_CODES else 1
                strong.append((response_round, rank, annotation))
        elif annotation["code"] == "Visual inspection and construction" or annotation["theme"] == "Delivering the answers":
            # Visual inspection inside a long friction span is part of the
            # struggle. It is a follow-up only after the final coded friction round.
            response_round = first_round_at_or_after(annotation, friction_end + 1)
            if response_round is not None:
                rank = 0 if annotation["code"] == "Visual inspection and construction" else 1
                fallback.append((response_round, rank, annotation))

    candidates = strong + fallback
    if not candidates:
        return None, None
    response_round, _, annotation = min(candidates, key=lambda item: (item[0], item[1]))
    return annotation, response_round


def classify_response(
    annotations: list[dict[str, Any]],
    friction: dict[str, Any],
) -> tuple[str, str, dict[str, Any] | None, int | None]:
    first, response_round = response_candidate(annotations, friction)
    if first is None:
        return "Abandoned unresolved", "No repair / task ended", None, None

    if first["code"] in RESPONSE_CODES:
        response, mechanism = RESPONSE_CODES[first["code"]]
        if first["code"] == "GUI self-correction" and "reaim" in first["detail"].lower():
            mechanism = "Persistent retry / re-aim"
        if response == "Moved off screen" and mechanism is None:
            offscreen_candidates = []
            for annotation in annotations:
                if annotation["theme"] != "Working off the screen":
                    continue
                candidate_round = first_round_at_or_after(annotation, response_round or 0)
                if candidate_round is not None:
                    offscreen_candidates.append((candidate_round, annotation))
            if offscreen_candidates:
                _, detail = min(offscreen_candidates, key=lambda item: item[0])
                mechanism = OFFSCREEN_MECHANISMS.get(detail["code"], "Direct code retreat")
            else:
                mechanism = "Direct code retreat"
        return response, mechanism or "Direct code retreat", first, response_round

    if first["theme"] == "Working off the screen":
        return (
            "Moved off screen",
            OFFSCREEN_MECHANISMS.get(first["code"], first["code"]),
            first,
            response_round,
        )

    if first["code"] == "Visual inspection and construction":
        return "Stayed on screen", "Persistent retry / re-aim", first, response_round

    if first["code"] in {"Grounded in-app visual evidence", "Computed and visually established evidence"}:
        return "Stayed on screen", "Persistent retry / re-aim", first, response_round
    if first["code"] == "Computed evidence":
        return "Moved off screen", "In-code analysis", first, response_round
    return "Abandoned unresolved", "No repair / task ended", first, response_round


def aggregate_links(episodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    edges: dict[tuple[str, str, str, str], list[dict[str, Any]]] = defaultdict(list)
    stage_pairs = (("friction", "response"), ("response", "mechanism"), ("mechanism", "landing"))
    for episode in episodes:
        for source_stage, target_stage in stage_pairs:
            edges[(source_stage, episode[source_stage], target_stage, episode[target_stage])].append(episode)
    links = []
    for (source_stage, source, target_stage, target), linked in edges.items():
        links.append({
            "source_stage": source_stage,
            "source": source,
            "target_stage": target_stage,
            "target": target,
            "count": len(linked),
            "episode_ids": [episode["episode_id"] for episode in linked],
            "trace_ids": sorted({episode["trace_id"] for episode in linked}),
        })
    return links


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--input",
        type=Path,
        default=Path(__file__).resolve().parents[1]
        / "data"
        / "annotations"
        / "agent_behaviors_trial1.json",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "analysis" / "friction_flow.json",
    )
    args = parser.parse_args()

    source = json.loads(args.input.read_text(encoding="utf-8"))
    by_trace: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for annotation in source["annotations"]:
        by_trace[annotation["trace_id"]].append(annotation)

    episodes = []
    for trace_id, annotations in by_trace.items():
        for friction in annotations:
            if friction["code"] not in FRICTION_LABELS:
                continue
            rounds = round_values(friction)
            response, mechanism, response_annotation, response_round = classify_response(annotations, friction)
            episodes.append({
                "episode_id": friction["annotation_id"],
                "trace_id": trace_id,
                "trace_number": friction["trace_number"],
                "model": friction["model"],
                "app": friction["app"],
                "task_id": friction["task_id"],
                "task_type": friction["task_type"],
                "friction": FRICTION_LABELS[friction["code"]],
                "friction_code": friction["code"],
                "friction_rounds": friction["round_reference"]["raw"],
                "friction_start_round": min(rounds),
                "friction_end_round": max(rounds),
                "response": response,
                "response_round": response_round,
                "response_annotation_id": response_annotation["annotation_id"] if response_annotation else None,
                "mechanism": mechanism,
                "landing": delivery_landing(annotations, min(rounds)),
            })
    episodes.sort(key=lambda episode: (episode["trace_number"], episode["friction_start_round"], episode["episode_id"]))

    stage_counts = {
        stage: dict(Counter(episode[stage] for episode in episodes))
        for stage in STAGE_ORDERS
    }
    invisible_or_unrepaired = sum(
        episode["response"] != "Stayed on screen" for episode in episodes
    )
    output = {
        "schema_version": "1.0",
        "classifier_version": "gui-friction-flow-v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": {
            "dataset": source.get("dataset"),
            "workbook_filename": source.get("source", {}).get("workbook_filename"),
            "workbook_sha256": source.get("source", {}).get("workbook_sha256"),
            "sheet": source.get("source", {}).get("sheet"),
        },
        "method": {
            "unit": "Each coded GUI-friction annotation is one episode; annotations are not merged across rows.",
            "response": "The first explicit switching, GUI-repair, overlooked-change, or off-screen annotation at or after friction onset. If none exists, the first visual or delivery annotation after the final friction round is used.",
            "mechanism": "The response annotation, or the first accompanying off-screen-work annotation for a channel switch.",
            "landing": "The trace's coded delivery-evidence category after friction begins, resolved to one mutually exclusive category by documented priority.",
        },
        "counts": {
            "episodes": len(episodes),
            "traces": len({episode["trace_id"] for episode in episodes}),
            "moved_off_screen": stage_counts["response"].get("Moved off screen", 0),
            "invisible_or_unrepaired": invisible_or_unrepaired,
        },
        "stage_orders": STAGE_ORDERS,
        "stage_counts": stage_counts,
        "links": aggregate_links(episodes),
        "episodes": episodes,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(output["counts"], indent=2))
    print(json.dumps(stage_counts, indent=2))


if __name__ == "__main__":
    main()
