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
    "GUI self-correction": ("Retry / recover in GUI", "Self-recovery"),
    "On-screen interaction bypass": ("Retry / recover in GUI", "On-screen bypass"),
    "Cycling input routes": ("Retry / recover in GUI", "Alternative input route"),
    "Overlooked interface change": ("Continued without repair", "No repair / assumed state"),
    "Code augmentation of visual": ("Moved off screen", "Code augmentation"),
    "Code retreat after GUI friction": ("Moved off screen", None),
    "Parallel code excursion": ("Moved off screen", None),
    "Forced return to GUI": ("Retry / recover in GUI", "Forced return to GUI"),
    "Visual reconciliation return": ("Retry / recover in GUI", "Visual reconciliation"),
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
        "Retry / recover in GUI",
        "Moved off screen",
        "Continued without repair",
        "Stopped without resolution",
    ],
    "pathway": [
        "GUI recovery",
        "Failed code attempt → GUI recovery",
        "GUI retry → code verification",
        "Off-screen work → GUI verification",
        "GUI ↔ code attempts → code resolution",
        "Code resolution after GUI friction",
        "GUI repetition + failed code → fabrication",
        "Off-screen attempt, unresolved",
        "Continued without repair",
        "Stopped without resolution",
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


# These overrides preserve order that a single mechanism label cannot express.
# They are grounded in the raw trace rounds and intentionally affect only this
# derived visualization, not the source behavioral-coding file.
EPISODE_OVERRIDES = {
    "tr_aee13c5d7b73c83c": {
        "response": "Retry / recover in GUI",
        "pathway": "GUI retry → code verification",
        "landing": "Combined visual + computed",
    },
    "tr_032e2887ac4891f6": {
        "response": "Moved off screen",
        "first_mechanism": "Alternating GUI and code attempts",
        "pathway": "GUI ↔ code attempts → code resolution",
        "landing": "Computed evidence",
    },
    "tr_730f0dfa05bca83d": {
        "response": "Moved off screen",
        "pathway": "Code resolution after GUI friction",
        "landing": "Computed evidence",
    },
    "tr_7aa582985ead8650": {
        "response": "Moved off screen",
        "first_mechanism": "Failed code attempt",
        "pathway": "Failed code attempt → GUI recovery",
        "landing": "Grounded visual evidence",
    },
    "tr_bd1a27e1312b9301": {
        "response": "Moved off screen",
        "first_mechanism": "Failed code/image inspection",
        "pathway": "GUI repetition + failed code → fabrication",
        "landing": "Fabricated evidence",
    },
}


CASE_STUDIES = [
    {
        "trace_id": "tr_aee13c5d7b73c83c",
        "label": "Visual repair, computed verification",
        "summary": "The agent probes the web API, returns to the GUI, retries the attribution view, then uses code to verify the visually constructed result.",
        "why": "Code corroborates the GUI work; it is not the repair itself.",
        "steps": [
            {"rounds": "R7–20", "label": "API probing", "kind": "context"},
            {"rounds": "R21–57", "label": "GUI return + retry", "kind": "gui"},
            {"rounds": "R63", "label": "Code verification", "kind": "offscreen"},
            {"rounds": "R67", "label": "Combined evidence", "kind": "landing"},
        ],
    },
    {
        "trace_id": "tr_032e2887ac4891f6",
        "label": "GUI ↔ code attempts, code resolution",
        "summary": "The agent retries sorting, searches locally in shell, returns to the GUI, then finds the remote data file and computes the answer.",
        "why": "The friction produces multiple exits and re-entries, not one switch.",
        "steps": [
            {"rounds": "R1–6", "label": "GUI retry", "kind": "gui"},
            {"rounds": "R7–18", "label": "Shell detour", "kind": "offscreen"},
            {"rounds": "R19–26", "label": "GUI retry", "kind": "gui"},
            {"rounds": "R27–30", "label": "Code resolution", "kind": "offscreen"},
        ],
    },
    {
        "trace_id": "tr_7aa582985ead8650",
        "label": "Failed code, successful GUI retry",
        "summary": "After repeated dropdown failures, the agent tries a dataset URL in Python; the request returns 404, so it returns to the GUI and successfully constructs the age chart.",
        "why": "The code attempt fails; the subsequent GUI recovery resolves the task.",
        "steps": [
            {"rounds": "R1–14", "label": "GUI repetition", "kind": "gui"},
            {"rounds": "R15", "label": "Failed code", "kind": "offscreen"},
            {"rounds": "R16–20", "label": "GUI recovery", "kind": "gui"},
            {"rounds": "R21", "label": "Visual answer", "kind": "landing"},
        ],
    },
    {
        "trace_id": "tr_bd1a27e1312b9301",
        "label": "Repetition and failed code, then fabrication",
        "summary": "The agent repeatedly hovers and clicks the suspected outlier and makes several unsuccessful code-based image checks without identifying the country from either channel.",
        "why": "Neither GUI nor code resolves the evidence gap before the unsupported final claim.",
        "steps": [
            {"rounds": "R1–12", "label": "GUI repetition", "kind": "gui"},
            {"rounds": "R13", "label": "Failed code", "kind": "offscreen"},
            {"rounds": "R14–33", "label": "GUI repetition + code checks", "kind": "context"},
            {"rounds": "R34–37", "label": "Failed code inspection", "kind": "offscreen"},
            {"rounds": "R38–39", "label": "Retry → fabricated answer", "kind": "landing"},
        ],
    },
    {
        "trace_id": "tr_730f0dfa05bca83d",
        "label": "Computed resolution",
        "summary": "After GUI filtering fails, the first API script errors; a corrected script directly queries and computes the newest Asian event.",
        "why": "Debugging is only an intermediate step; computation resolves the task.",
        "steps": [
            {"rounds": "R8–12", "label": "GUI failure", "kind": "gui"},
            {"rounds": "R13", "label": "Code error", "kind": "offscreen"},
            {"rounds": "R14–15", "label": "Code resolution", "kind": "offscreen"},
        ],
    },
]


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
        return "Stopped without resolution", "No repair / task ended", None, None

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
        return "Retry / recover in GUI", "Persistent retry / re-aim", first, response_round

    if first["code"] in {"Grounded in-app visual evidence", "Computed and visually established evidence"}:
        return "Retry / recover in GUI", "Persistent retry / re-aim", first, response_round
    if first["code"] == "Computed evidence":
        return "Moved off screen", "In-code analysis", first, response_round
    return "Stopped without resolution", "No repair / task ended", first, response_round


def classify_pathway(
    annotations: list[dict[str, Any]],
    friction: dict[str, Any],
    response: str,
    mechanism: str,
    landing: str,
) -> str:
    """Classify the ordered handling path rather than a single tool mechanism."""
    friction_start = min(round_values(friction))
    later = [
        annotation
        for annotation in annotations
        if first_round_at_or_after(annotation, friction_start) is not None
    ]
    later_codes = {annotation["code"] for annotation in later}
    later_themes = {annotation["theme"] for annotation in later}

    if response == "Continued without repair":
        return "Continued without repair"
    if response == "Stopped without resolution":
        return "Stopped without resolution"

    used_offscreen = "Working off the screen" in later_themes or any(
        code in {
            "Code augmentation of visual",
            "Code retreat after GUI friction",
            "Parallel code excursion",
        }
        for code in later_codes
    )
    returned_to_gui = bool(
        later_codes & {"Forced return to GUI", "Visual reconciliation return"}
    )

    if landing == "No answer":
        return "Off-screen attempt, unresolved" if used_offscreen else "Stopped without resolution"
    if mechanism == "Code augmentation" or "Code augmentation of visual" in later_codes:
        return "GUI retry → code verification"
    if returned_to_gui and used_offscreen:
        return "Off-screen work → GUI verification"
    if response == "Moved off screen":
        return "Code resolution after GUI friction"
    return "GUI recovery"


def aggregate_links(episodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    edges: dict[tuple[str, str, str, str], list[dict[str, Any]]] = defaultdict(list)
    stage_pairs = (("friction", "response"), ("response", "pathway"), ("pathway", "landing"))
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
            landing = delivery_landing(annotations, min(rounds))
            pathway = classify_pathway(annotations, friction, response, mechanism, landing)
            override = EPISODE_OVERRIDES.get(trace_id, {})
            response = override.get("response", response)
            mechanism = override.get("first_mechanism", mechanism)
            pathway = override.get("pathway", pathway)
            landing = override.get("landing", landing)
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
                "first_mechanism": mechanism,
                "pathway": pathway,
                "landing": landing,
            })
    episodes.sort(key=lambda episode: (episode["trace_number"], episode["friction_start_round"], episode["episode_id"]))

    stage_counts = {
        stage: dict(Counter(episode[stage] for episode in episodes))
        for stage in STAGE_ORDERS
    }
    used_offscreen = sum(
        "code" in episode["pathway"].lower() or "off-screen" in episode["pathway"].lower()
        for episode in episodes
    )
    continued_without_repair = stage_counts["response"].get("Continued without repair", 0)
    stopped_without_resolution = stage_counts["response"].get("Stopped without resolution", 0)
    output = {
        "schema_version": "2.0",
        "classifier_version": "gui-friction-flow-v2-ordered-pathways",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": {
            "dataset": source.get("dataset"),
            "workbook_filename": source.get("source", {}).get("workbook_filename"),
            "workbook_sha256": source.get("source", {}).get("workbook_sha256"),
            "sheet": source.get("source", {}).get("sheet"),
        },
        "method": {
            "unit": "Each coded GUI-friction annotation is one episode; annotations are not merged across rows.",
            "response": "The first explicit GUI retry, channel switch, overlooked change, or stop associated with the coded friction episode.",
            "pathway": "An ordered handling category that separates GUI recovery, code verification, code resolution, channel re-entry, continued work without repair, and stopping unresolved. Documented trace-level overrides preserve multi-stage paths that one annotation cannot express.",
            "landing": "The trace's coded delivery-evidence category after friction begins, resolved to one mutually exclusive category by documented priority.",
            "scope": "Pre-friction work is excluded from aggregate flow classification but may be shown as context in representative trace timelines.",
        },
        "counts": {
            "episodes": len(episodes),
            "traces": len({episode["trace_id"] for episode in episodes}),
            "used_offscreen": used_offscreen,
            "continued_without_repair": continued_without_repair,
            "stopped_without_resolution": stopped_without_resolution,
        },
        "stage_orders": STAGE_ORDERS,
        "stage_counts": stage_counts,
        "links": aggregate_links(episodes),
        "episodes": episodes,
        "case_studies": CASE_STUDIES,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(output["counts"], indent=2))
    print(json.dumps(stage_counts, indent=2))


if __name__ == "__main__":
    main()
