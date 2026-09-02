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

Automated evaluator commentary, costs, timestamps, provider credentials, seeds, trials, and source filesystem metadata are excluded before upload.

## Local preview

Run a static HTTP server from the repository root:

```bash
python3 -m http.server 8080
```

Then open `http://127.0.0.1:8080`.

The S3 data location is configured in `config.js`.
