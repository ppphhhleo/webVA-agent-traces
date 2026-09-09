# WebVA Agent Traces

A public, read-only browser for selected agent interaction traces from web visual analytics tasks.

The repository contains only the static viewer. Sanitized trajectory JSON and screenshots are stored separately in Amazon S3 and loaded at runtime. Updating this viewer therefore updates the presentation of every existing trace without regenerating trace-specific HTML.

## Public data contract

The published collection contains only:

- offline trace number and stable trace ID
- task ID, task type, and task/system prompts
- model name
- screenshots
- normalized model and tool outputs
- final answer
- acting time and aggregate input/output token counts
- manually checked answer score (when available)
- normalized completion state (`completed` or `unfinished`)

Automated evaluator commentary, costs, timestamps, provider credentials, seeds, trials, and source filesystem metadata are excluded before upload.

## Local preview

Run a static HTTP server from the repository root:

```bash
python3 -m http.server 8080
```

Then open `http://127.0.0.1:8080`.

The S3 data location is configured in `config.js`.

## Cross-trace analysis

The `/analysis/` route plots each public trace by:

- horizontal axis: off-screen rounds divided by GUI plus off-screen rounds
- vertical axis: the one-based first off-screen round divided by all model rounds

Desktop screenshots and waits count as GUI; Shell, Python, file, and browser-script actions count as off-screen. Neutral rounds are excluded from the share. Answer-only traces with no working actions are assigned 100% visibility and 0% off-screen reliance by convention. Traces without off-screen work are plotted at 0% off-screen share and 100% delay, with slight packing for visibility.

The route reads a small derived dataset from `analysis/data.json`. Rebuild it after publishing new traces:

```bash
python3 scripts/build_analysis_data.py
```

The analysis interface uses native browser SVG and DOM APIs rather than D3. At
runtime it loads `analysis/data.json`, `analysis/evidence_visibility.json`,
`analysis/friction_flow.json`, `analysis/code_error_flow.json`, and
`analysis/behavior_summary.json`; the performance table, quantitative charts,
model-level statistics in the behavioral-signature prose, and friction totals
are calculated from those files. Interpretive labels and representative trace
links remain researcher-authored. Regenerate the derived JSON files after a
trajectory or annotation correction so every dependent view updates together.

The engineering-error alluvial consolidates repeated shell/Python failures to
one flow per error-bearing trace. Rebuild it from the public trajectories and
the audited behavior annotations with:

```bash
python3 scripts/build_code_error_flow.py
```

The command writes two versioned, plot-ready sources:

- `analysis/code_error_flow.json` contains provenance, category definitions,
  stage orders, aggregate links, and the underlying trace-level `episodes`.
- `analysis/code_error_flow.csv` is a flat companion table with one row per
  error-bearing trace for analysis in Python, R, or a spreadsheet.

The `/analysis/` engineering-friction flow is calculated at runtime from the
JSON `episodes`; the included `links` and `stage_counts` are reproducible
derivatives for validation rather than hand-authored plot values. A trace is
the unit of analysis, so repeated failures in one long trajectory do not
inflate the flow. The `trace_id`, `task_id`, `task_type`, and `model` fields
support joins to the other analysis datasets and model/task breakdowns.

For an offline rebuild, pass a directory containing one `<trace_id>.json` file
per public trace with `--trace-dir /path/to/traces`.

## Behavior annotations

Researcher-coded behaviors are stored separately from immutable trajectories as one
trace-linked JSON dataset. Each annotation retains its theme, code, original round
reference, normalized round numbers, and source spreadsheet row. Rebuild it from the
trial-one coding sheet with:

```bash
python3 scripts/build_behavior_annotations.py /path/to/Trace\ Coding.xlsx
```

Publish the generated file at
`data/annotations/agent_behaviors_trial1.json`. Updating annotations does not modify
the original trajectory JSON or screenshots.

Generate the compact, aggregate datasource tracked by GitHub after updating the
episode-level annotation file:

```bash
python3 scripts/build_behavior_summary.py
```

This writes `analysis/behavior_summary.json`, containing episode counts and
trace prevalence for every model × behavior, with distinct-trace prevalence
partitioned by task type. The public behavior matrix uses the 30 traces per model
as its baseline and renders low-level, compound, and high-level prevalence as a
stacked bar. Publication plot scripts can use the same derivative without
downloading the episode-level annotations from S3.

The GUI-friction alluvial on `/analysis/` is a reproducible derivative of that
annotation file. It treats each coded ineffective/misgrounded or repeated GUI
manipulation annotation as one episode and follows it through the first coded
response, ordered resolution pathway, and eventual evidence landing. This keeps
GUI recovery, code verification, code resolution, and unresolved endings distinct:

```bash
python3 scripts/build_friction_flow.py
```

This writes `analysis/friction_flow.json`, including episode-level provenance,
documented multi-stage case timelines, and the aggregated links used by the
visualization. Earlier actions may appear as context in a case timeline but are not
treated as consequences of later friction. The flow is descriptive, not causal.

## GAIA sample

The `/gaia/` route displays a paired sample of 30 GAIA tasks across four models. The same task sample is used for every model and is stratified by GAIA difficulty level.

To respect the benchmark's redistribution constraints, the public files contain only opaque task numbers, levels, attachment presence, outcomes, token totals, and normalized action structure. Questions, answers, reasoning, tool arguments and observations, source identifiers, and screenshots are withheld. The complete source bundle remains private.

Build the sanitized data on the machine that holds the private archive:

```bash
python3 scripts/build_gaia_public.py \
  --source-root /path/to/ohindex_gaia_targetmodels \
  --viewer-root /path/to/gaia_viewer \
  --output-dir /path/to/public-gaia
```

The same sample can be materialized with its full gated benchmark content for authenticated review only:

```bash
python3 scripts/build_gaia_private.py \
  --source-root /path/to/ohindex_gaia_targetmodels \
  --viewer-root /path/to/gaia_viewer \
  --output-dir /path/to/private-gaia-full
```

The private export adds prompts, answers, reasoning, tool arguments and observations, source identifiers, and available screenshots. Never place it under the publicly readable `data/` prefix.
