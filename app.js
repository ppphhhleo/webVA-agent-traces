const CONFIG = window.TRACE_COLLECTION_CONFIG || {};
const DATA_BASE = new URL(CONFIG.dataBaseUrl || "./data/", window.location.href);

const state = {
  catalog: [],
  filtered: [],
  selected: null,
  trajectory: null,
  rounds: [],
  roundIndex: 0,
  playTimer: null,
  playbackDelay: 850,
};

const $ = (selector) => document.querySelector(selector);
const elements = {
  count: $("#trace-count"),
  status: $("#catalog-status"),
  list: $("#trace-list"),
  search: $("#search"),
  modelFilter: $("#model-filter"),
  taskFilter: $("#task-filter"),
  empty: $("#viewer-empty"),
  content: $("#viewer-content"),
  number: $("#trace-number"),
  model: $("#trace-model"),
  task: $("#trace-task"),
  taskType: $("#trace-type"),
  actingTime: $("#acting-time"),
  inputTokens: $("#input-tokens"),
  outputTokens: $("#output-tokens"),
  checkScore: $("#check-score"),
  traceId: $("#trace-id"),
  copyId: $("#copy-id"),
  prompt: $("#task-prompt"),
  systemPrompt: $("#system-prompt"),
  roundPosition: $("#round-position"),
  roundTitle: $("#round-title"),
  roundError: $("#round-error-badge"),
  roundTotal: $("#round-total"),
  roundList: $("#round-list"),
  image: $("#screen-image"),
  imageLoading: $("#screen-loading"),
  imageUnavailable: $("#screen-unavailable"),
  cursor: $("#action-cursor"),
  rationale: $("#round-rationale"),
  actionName: $("#action-name"),
  actionDetails: $("#action-details"),
  executionOutput: $("#execution-output"),
  executionStatus: $("#execution-status"),
  rawOutput: $("#raw-output"),
  finalAnswer: $("#final-answer"),
  previous: $("#previous-round"),
  next: $("#next-round"),
  play: $("#play-rounds"),
  slider: $("#round-slider"),
  guiRatio: $("#gui-ratio"),
  offscreenRatio: $("#offscreen-ratio"),
  neutralRounds: $("#neutral-rounds"),
  toast: $("#toast"),
};

const GUI_ACTION_TYPES = new Set([
  "click", "left_click", "right_click", "double_click", "triple_click",
  "desktop_click", "desktop_double_click", "desktop_triple_click", "desktop_right_click",
  "move", "desktop_move", "drag", "desktop_drag", "scroll", "desktop_scroll",
  "type", "desktop_type", "keypress", "desktop_keypress", "hotkey", "desktop_hotkey",
]);
const OFFSCREEN_ACTION_TYPES = new Set([
  "shell", "desktop_shell", "run_python", "desktop_python", "run_shell",
  "write_file", "read_file", "browser_script", "run_javascript",
]);

function text(value, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function compact(value, length = 92) {
  const normalized = text(value, "").replace(/\s+/g, " ").trim();
  return normalized.length > length ? `${normalized.slice(0, length - 1)}…` : normalized;
}

function canonicalModel(value) {
  const source = text(value, "Unknown model").trim();
  const key = source.toLowerCase().replace(/[\s_-]+/g, "");
  const labels = {
    gpt54: "GPT-5.4",
    gpt55: "GPT-5.5",
    opus48: "Claude Opus 4.8",
    claudeopus48: "Claude Opus 4.8",
    sonnet5: "Claude Sonnet 5",
    claudesonnet5: "Claude Sonnet 5",
  };
  return labels[key] || source;
}

function canonicalTaskType(value) {
  const key = text(value, "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  const labels = { "low-level": "Low-level", "high-level": "High-level", compound: "Compound" };
  return labels[key] || (value ? text(value) : "Unspecified");
}

function modelBadgeClass(model) {
  const value = canonicalModel(model);
  if (value === "GPT-5.5") return "model-gpt55";
  if (value === "GPT-5.4") return "model-gpt54";
  if (value === "Claude Opus 4.8") return "model-opus";
  if (value === "Claude Sonnet 5") return "model-sonnet";
  return "model-other";
}

function taskTypeBadgeClass(taskType) {
  const value = canonicalTaskType(taskType);
  if (value === "Low-level") return "type-low";
  if (value === "High-level") return "type-high";
  if (value === "Compound") return "type-compound";
  return "type-other";
}

function isUnfinished(trace) {
  return trace.summary?.completion_status === "unfinished";
}

function formatDuration(milliseconds) {
  const value = Number(milliseconds);
  if (!Number.isFinite(value)) return "—";
  if (value < 60_000) return `${(value / 1000).toFixed(1)}s`;
  const minutes = Math.floor(value / 60_000);
  const seconds = Math.round((value % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function formatTokens(tokens) {
  const value = Number(tokens);
  if (!Number.isFinite(value)) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toLocaleString();
}

function formatScore(score) {
  const value = Number(score);
  return Number.isFinite(value) ? `${value.toFixed(value % 1 ? 1 : 0)} / 1` : "Not scored";
}

function actionType(action) {
  return action?.type || action?.action || action?.name || "output";
}

function displayAction(type) {
  const labels = {
    click: "Click", left_click: "Click", double_click: "Double click",
    triple_click: "Triple click", right_click: "Right click", move: "Move",
    drag: "Drag", scroll: "Scroll", type: "Type", keypress: "Keypress",
    wait: "Wait", screenshot: "Screenshot", final_answer: "Final answer",
    desktop_shell: "Run shell", run_python: "Run Python", desktop_python: "Run Python",
    shell: "Run shell", browser_action: "Browser action",
  };
  return labels[type] || String(type).replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function requestedActions(modelEvent) {
  const data = modelEvent?.data || {};
  if (Array.isArray(data.actions) && data.actions.length) return data.actions;
  if (data.action) return [data.action];
  if (Array.isArray(data.requested_actions)) return data.requested_actions;
  if (data.requested_action) return [data.requested_action];
  return [];
}

function executionEvents(events, step) {
  return events.filter((event) =>
    event.step_index === step && ["tool_call", "browser_action", "action"].includes(event.event_type)
  );
}

function roundHasError(round) {
  return round.executions.some((event) => event.data?.ok === false || Boolean(event.data?.error));
}

function roundWorkMode(round) {
  const types = round.actions.map((action) => String(actionType(action)).toLowerCase());
  if (types.some((type) => OFFSCREEN_ACTION_TYPES.has(type))) return "offscreen";
  if (types.some((type) => GUI_ACTION_TYPES.has(type))) return "gui";
  return "neutral";
}

function renderWorkModeSummary() {
  const modes = state.rounds.map(roundWorkMode);
  const gui = modes.filter((mode) => mode === "gui").length;
  const offscreen = modes.filter((mode) => mode === "offscreen").length;
  const neutral = modes.length - gui - offscreen;
  const working = gui + offscreen;
  const guiPercent = working ? Math.round((gui / working) * 100) : 0;
  const offscreenPercent = working ? 100 - guiPercent : 0;
  elements.guiRatio.textContent = `GUI ${gui} · ${guiPercent}%`;
  elements.offscreenRatio.textContent = `Off-screen ${offscreen} · ${offscreenPercent}%`;
  elements.neutralRounds.textContent = `${neutral} neutral`;
  elements.neutralRounds.hidden = neutral === 0;

  const colors = { gui: "var(--mode-gui)", offscreen: "var(--mode-offscreen)", neutral: "var(--mode-neutral)" };
  if (!modes.length) {
    elements.slider.style.setProperty("--mode-gradient", "var(--mode-neutral)");
    return;
  }
  const size = 100 / modes.length;
  const stops = modes.flatMap((mode, index) => {
    const start = (index * size).toFixed(4);
    const end = ((index + 1) * size).toFixed(4);
    return [`${colors[mode]} ${start}%`, `${colors[mode]} ${end}%`];
  });
  elements.slider.style.setProperty("--mode-gradient", `linear-gradient(to right, ${stops.join(", ")})`);
}

function screenshotUrl(artifactPath, trajectoryUrl) {
  if (!artifactPath) return null;
  return new URL(artifactPath, trajectoryUrl).href;
}

function buildRounds(trajectory, trajectoryUrl) {
  const rounds = [];
  let latestScreenshot = null;
  for (const event of trajectory.events || []) {
    if (event.event_type === "screenshot") {
      const artifact = event.artifact_paths?.[0];
      if (artifact) latestScreenshot = screenshotUrl(artifact, trajectoryUrl);
    }
    if (event.event_type !== "model_message") continue;
    const actions = requestedActions(event);
    const executions = executionEvents(trajectory.events || [], event.step_index);
    const rationale = event.data?.thought || event.data?.reasoning || event.data?.text || "No rationale recorded.";
    const title = actions.length
      ? actions.map((action) => displayAction(actionType(action))).join(" → ")
      : "Model output";
    rounds.push({ event, actions, executions, rationale, title, screenshot: latestScreenshot });
  }
  return rounds;
}

function systemPrompt(trajectory) {
  for (const event of trajectory.events || []) {
    const request = event.data?.llm_input?.request;
    if (request?.instructions) return request.instructions;
    if (request?.system) return typeof request.system === "string" ? request.system : JSON.stringify(request.system, null, 2);
  }
  return "Not recorded.";
}

function rawRoundOutput(round) {
  const parts = [];
  const rawResponse = round.event.data?.raw_response;
  if (rawResponse) parts.push(`MODEL OUTPUT\n${text(rawResponse)}`);
  for (const execution of round.executions) {
    const data = execution.data || {};
    const heading = `${data.tool_name || execution.event_type}${data.ok === false ? " · error" : ""}`;
    const output = data.error || data.output || data.message || "No textual output.";
    parts.push(`${heading.toUpperCase()}\n${text(output)}`);
  }
  return parts.join("\n\n") || "No raw textual output recorded for this round.";
}

function formatFieldValue(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function formattedActions(actions) {
  if (!actions.length) return "No structured action was requested.";
  return actions.map((action, index) => {
    if (!action || typeof action !== "object") return `${index + 1}. ${text(action)}`;
    const label = `${index + 1}. ${displayAction(actionType(action))}`;
    const fields = Object.entries(action).filter(([key]) => !["type", "action", "name"].includes(key));
    if (!fields.length) return label;
    const body = fields.map(([key, value]) => {
      const formatted = formatFieldValue(value);
      return formatted.includes("\n") ? `${key}:\n${formatted}` : `${key}: ${formatted}`;
    }).join("\n\n");
    return `${label}\n\n${body}`;
  }).join("\n\n────────────────────────\n\n");
}

function formattedExecutionOutput(round) {
  if (!round.executions.length) return "No execution output was recorded for this round.";
  return round.executions.map((execution, index) => {
    const data = execution.data || {};
    const failed = data.ok === false || Boolean(data.error);
    const label = data.tool_name ? displayAction(data.tool_name) : displayAction(execution.event_type);
    const value = data.error || data.output || data.message || "No textual output was returned.";
    return `${index + 1}. ${label} · ${failed ? "Error" : "Completed"}\n\n${formatFieldValue(value)}`;
  }).join("\n\n────────────────────────\n\n");
}

function cursorPoint(actions) {
  const action = [...actions].reverse().find((item) => Number.isFinite(item?.x) && Number.isFinite(item?.y));
  if (!action) return null;
  return { x: action.x, y: action.y };
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => elements.toast.classList.remove("visible"), 1800);
}

function populateFilters() {
  const models = [...new Set(state.catalog.map((trace) => trace.model).filter(Boolean))].sort();
  const tasks = [...new Set(state.catalog.map((trace) => trace.task_id).filter((value) => value !== null && value !== undefined))]
    .sort((a, b) => Number(a) - Number(b));
  for (const model of models) elements.modelFilter.add(new Option(model, model));
  for (const task of tasks) elements.taskFilter.add(new Option(`Task ${task}`, String(task)));
}

function applyFilters() {
  const query = elements.search.value.trim().toLowerCase();
  const model = elements.modelFilter.value;
  const task = elements.taskFilter.value;
  state.filtered = state.catalog.filter((trace) => {
    const haystack = [trace.trace_number, trace.trace_id, trace.task_id, `Task ${trace.task_id}`, trace.task_type, trace.task_prompt, trace.model, trace.final_answer, trace.summary?.completion_status]
      .join(" ").toLowerCase();
    return (!query || haystack.includes(query)) && (!model || trace.model === model) && (!task || String(trace.task_id) === task);
  });
  renderCatalog();
}

function renderCatalog() {
  elements.count.textContent = state.filtered.length;
  elements.status.textContent = state.filtered.length === state.catalog.length
    ? `${state.catalog.length} public traces`
    : `${state.filtered.length} of ${state.catalog.length} traces`;
  elements.list.replaceChildren(...state.filtered.map((trace) => {
    const item = document.createElement("li");
    const unfinished = isUnfinished(trace);
    item.className = `trace-item${state.selected?.trace_id === trace.trace_id ? " active" : ""}${unfinished ? " unfinished" : ""}`;
    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = `
      <span class="item-number">${trace.trace_number}</span>
      <span class="item-copy">
        <span class="item-meta">
          <span class="item-task">Task ${trace.task_id}</span>
          <span class="item-badge ${taskTypeBadgeClass(trace.task_type)}">${escapeHtml(trace.task_type)}</span>
          <span class="item-badge ${modelBadgeClass(trace.model)}">${escapeHtml(trace.model)}</span>
          ${unfinished ? '<span class="item-badge status-unfinished">Unfinished</span>' : ""}
        </span>
        <strong>${escapeHtml(compact(trace.task_prompt || "Untitled task", 74))}</strong>
        <p>${escapeHtml(trace.trace_id)}</p>
      </span>`;
    button.addEventListener("click", () => selectTrace(trace));
    item.append(button);
    return item;
  }));
  requestAnimationFrame(() => elements.list.querySelector(".trace-item.active")?.scrollIntoView({ block: "nearest" }));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);
}

async function selectTrace(trace, { updateHash = true } = {}) {
  stopPlayback();
  state.selected = trace;
  state.trajectory = null;
  state.rounds = [];
  state.roundIndex = 0;
  elements.guiRatio.textContent = "GUI —";
  elements.offscreenRatio.textContent = "Off-screen —";
  elements.neutralRounds.hidden = true;
  elements.slider.style.setProperty("--mode-gradient", "var(--mode-neutral)");
  renderCatalog();
  elements.empty.hidden = true;
  elements.content.hidden = false;
  elements.number.textContent = `Trace ${trace.trace_number}`;
  elements.model.textContent = trace.model;
  elements.model.className = `model-badge ${modelBadgeClass(trace.model)}`;
  elements.task.textContent = `Task ${trace.task_id}`;
  elements.taskType.textContent = trace.task_type;
  elements.taskType.className = `type-badge ${taskTypeBadgeClass(trace.task_type)}`;
  const summary = trace.summary || {};
  elements.actingTime.textContent = formatDuration(summary.acting_time_ms);
  elements.inputTokens.textContent = formatTokens(summary.input_tokens);
  elements.outputTokens.textContent = formatTokens(summary.output_tokens);
  elements.checkScore.textContent = formatScore(summary.check_answer_score);
  elements.traceId.textContent = trace.trace_id;
  elements.prompt.textContent = trace.task_prompt || "Loading task prompt…";
  elements.systemPrompt.textContent = "Loading…";
  elements.roundPosition.textContent = "Loading replay";
  elements.roundTitle.textContent = "Preparing trace…";
  elements.roundError.hidden = true;
  elements.executionStatus.classList.remove("error");
  elements.finalAnswer.textContent = trace.final_answer || "No final answer recorded.";
  elements.roundList.replaceChildren();
  showImage(null);
  if (updateHash) history.replaceState(null, "", `#trace=${encodeURIComponent(trace.trace_id)}`);

  try {
    const trajectoryUrl = new URL(trace.trajectory_url, DATA_BASE);
    const response = await fetch(trajectoryUrl);
    if (!response.ok) throw new Error(`Trace request failed (${response.status})`);
    const trajectory = await response.json();
    if (state.selected?.trace_id !== trace.trace_id) return;
    state.trajectory = trajectory;
    state.rounds = buildRounds(trajectory, trajectoryUrl);
    elements.prompt.textContent = trajectory.task?.goal || trace.task_prompt || "No task prompt recorded.";
    elements.systemPrompt.textContent = systemPrompt(trajectory);
    elements.slider.max = Math.max(0, state.rounds.length - 1);
    elements.roundTotal.textContent = `${state.rounds.length} total`;
    renderWorkModeSummary();
    renderRoundList();
    renderRound(0);
  } catch (error) {
    elements.roundPosition.textContent = "Replay unavailable";
    elements.roundTitle.textContent = "Could not load this trace";
    elements.roundError.hidden = true;
    elements.rationale.textContent = error.message;
    elements.actionName.textContent = "Check S3 access and CORS";
    elements.actionDetails.textContent = "The catalog loaded, but the selected trajectory JSON could not be fetched.";
    showImage(null);
  }
}

function renderRoundList() {
  elements.roundList.replaceChildren(...state.rounds.map((round, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    const mode = roundWorkMode(round);
    button.className = `round-link mode-${mode}${index === state.roundIndex ? " active" : ""}`;
    const error = roundHasError(round);
    const modeLabel = mode === "gui" ? "GUI" : mode === "offscreen" ? "Off-screen" : "";
    button.innerHTML = `<span class="round-index">${index + 1}</span><span class="round-copy"><span class="round-title-line"><strong>${escapeHtml(round.title)}</strong>${modeLabel ? `<em class="mode-label ${mode}">${modeLabel}</em>` : ""}${error ? '<em class="round-error">Error</em>' : ""}</span><span>${escapeHtml(compact(round.rationale, 54))}</span></span>`;
    button.addEventListener("click", () => renderRound(index));
    item.append(button);
    return item;
  }));
}

function showImage(url, point = null, viewport = null) {
  elements.image.classList.remove("loaded");
  elements.cursor.hidden = true;
  if (!url) {
    elements.image.removeAttribute("src");
    elements.imageLoading.hidden = true;
    elements.imageUnavailable.hidden = false;
    return;
  }
  elements.imageUnavailable.hidden = true;
  elements.imageLoading.hidden = false;
  elements.image.onload = () => {
    elements.imageLoading.hidden = true;
    elements.image.classList.add("loaded");
    if (point && viewport?.width && viewport?.height) {
      elements.cursor.style.left = `${(point.x / viewport.width) * 100}%`;
      elements.cursor.style.top = `${(point.y / viewport.height) * 100}%`;
      elements.cursor.hidden = false;
    }
  };
  elements.image.onerror = () => {
    elements.imageLoading.hidden = true;
    elements.imageUnavailable.hidden = false;
  };
  elements.image.src = url;
}

function renderRound(index) {
  if (!state.rounds.length) {
    elements.roundPosition.textContent = "No model rounds";
    elements.roundTitle.textContent = "Trace contains no model messages";
    return;
  }
  state.roundIndex = Math.max(0, Math.min(index, state.rounds.length - 1));
  const round = state.rounds[state.roundIndex];
  elements.roundPosition.textContent = `Round ${state.roundIndex + 1} of ${state.rounds.length}`;
  elements.roundTitle.textContent = round.title;
  const hasError = roundHasError(round);
  elements.roundError.hidden = !hasError;
  elements.rationale.textContent = text(round.rationale, "No rationale recorded.");
  elements.actionName.textContent = round.title;
  elements.actionDetails.textContent = formattedActions(round.actions);
  elements.executionOutput.textContent = formattedExecutionOutput(round);
  elements.executionStatus.textContent = hasError ? "Error recorded" : "Recorded";
  elements.executionStatus.classList.toggle("error", hasError);
  elements.rawOutput.textContent = rawRoundOutput(round);
  elements.slider.value = state.roundIndex;
  elements.previous.disabled = state.roundIndex === 0;
  elements.next.disabled = state.roundIndex === state.rounds.length - 1;
  const viewport = round.event.data?.viewport || state.trajectory.events?.find((event) => event.event_type === "screenshot")?.data?.viewport;
  showImage(round.screenshot, cursorPoint(round.actions), viewport);
  renderRoundList();
  requestAnimationFrame(() => elements.roundList.querySelector(".active")?.scrollIntoView({ block: "nearest", inline: "nearest" }));
}

function stopPlayback() {
  window.clearInterval(state.playTimer);
  state.playTimer = null;
  elements.play.innerHTML = "<span>▶</span> Play";
}

function togglePlayback() {
  if (state.playTimer) return stopPlayback();
  if (!state.rounds.length) return;
  if (state.roundIndex >= state.rounds.length - 1) renderRound(0);
  elements.play.innerHTML = "<span>Ⅱ</span> Pause";
  state.playTimer = window.setInterval(() => {
    if (state.roundIndex >= state.rounds.length - 1) return stopPlayback();
    renderRound(state.roundIndex + 1);
  }, state.playbackDelay);
}

async function loadCatalog() {
  try {
    const response = await fetch(new URL("catalog.json", DATA_BASE));
    if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
    const payload = await response.json();
    state.catalog = [...(payload.traces || [])]
      .map((trace) => ({
        ...trace,
        model: canonicalModel(trace.model),
        task_type: canonicalTaskType(trace.task_type),
      }))
      .sort((a, b) => Number(a.trace_number) - Number(b.trace_number));
    state.filtered = state.catalog;
    populateFilters();
    renderCatalog();
    const requested = decodeURIComponent(location.hash.replace(/^#trace=/, ""));
    const initial = state.catalog.find((trace) => trace.trace_id === requested) || state.catalog[0];
    if (initial) selectTrace(initial, { updateHash: !requested });
  } catch (error) {
    elements.status.textContent = "Catalog unavailable";
    elements.list.innerHTML = `<li class="catalog-status">${escapeHtml(error.message)}. Confirm that the S3 data upload and public-read policy are complete.</li>`;
  }
}

elements.search.addEventListener("input", applyFilters);
elements.modelFilter.addEventListener("change", applyFilters);
elements.taskFilter.addEventListener("change", applyFilters);
elements.previous.addEventListener("click", () => renderRound(state.roundIndex - 1));
elements.next.addEventListener("click", () => renderRound(state.roundIndex + 1));
elements.slider.addEventListener("input", (event) => renderRound(Number(event.target.value)));
elements.play.addEventListener("click", togglePlayback);
elements.copyId.addEventListener("click", async () => {
  await navigator.clipboard.writeText(state.selected?.trace_id || "");
  showToast("Trace ID copied");
});
document.querySelectorAll("[data-speed]").forEach((button) => button.addEventListener("click", () => {
  state.playbackDelay = Number(button.dataset.speed);
  document.querySelectorAll("[data-speed]").forEach((item) => item.classList.toggle("active", item === button));
  if (state.playTimer) { stopPlayback(); togglePlayback(); }
}));
window.addEventListener("hashchange", () => {
  const requested = decodeURIComponent(location.hash.replace(/^#trace=/, ""));
  const trace = state.catalog.find((item) => item.trace_id === requested);
  if (trace && trace.trace_id !== state.selected?.trace_id) selectTrace(trace, { updateHash: false });
});
document.addEventListener("keydown", (event) => {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
  if (event.key === "ArrowLeft") renderRound(state.roundIndex - 1);
  if (event.key === "ArrowRight") renderRound(state.roundIndex + 1);
  if (event.key === " ") { event.preventDefault(); togglePlayback(); }
});

loadCatalog();
