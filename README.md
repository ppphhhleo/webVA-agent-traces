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
