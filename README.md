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

Desktop screenshots and waits count as GUI; Shell, Python, file, and browser-script actions count as off-screen. Neutral rounds are excluded from the share. Traces without off-screen work are plotted at 0% off-screen share and 100% delay, with slight packing for visibility.

The route reads a small derived dataset from `analysis/data.json`. Rebuild it after publishing new traces:

```bash
python3 scripts/build_analysis_data.py
```

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

The GUI-friction alluvial on `/analysis/` is a reproducible derivative of that
annotation file. It treats each coded ineffective/misgrounded or repeated GUI
manipulation annotation as one episode and follows it through the first coded
response, mechanism, and eventual evidence landing:

```bash
python3 scripts/build_friction_flow.py
```

This writes `analysis/friction_flow.json`, including episode-level provenance and
the aggregated links used by the visualization. The flow is a descriptive coded
sequence, not a causal estimate.

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
