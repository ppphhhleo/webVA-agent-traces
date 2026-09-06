const CONFIG = window.TRACE_COLLECTION_CONFIG || {};
const DATA_BASE = new URL("gaia/", new URL(CONFIG.dataBaseUrl || "../data/", window.location.href));

const state = { catalog: [], filtered: [], selected: null, trace: null, roundIndex: 0, timer: null, delay: 800 };
const $ = (selector) => document.querySelector(selector);
const elements = {
  count: $("#trace-count"), note: $("#sample-note"), status: $("#catalog-status"), list: $("#trace-list"),
  search: $("#search"), modelFilter: $("#model-filter"), levelFilter: $("#level-filter"), outcomeFilter: $("#outcome-filter"),
  empty: $("#viewer-empty"), content: $("#viewer-content"), taskNumber: $("#task-number"), model: $("#trace-model"),
  level: $("#trace-level"), attachment: $("#trace-attachment"), outcome: $("#trace-outcome"), roundCount: $("#round-count"),
  inputTokens: $("#input-tokens"), outputTokens: $("#output-tokens"), score: $("#trace-score"), traceId: $("#trace-id"), copyId: $("#copy-id"),
  roundPosition: $("#round-position"), roundTitle: $("#round-title"), onscreenRatio: $("#onscreen-ratio"), offscreenRatio: $("#offscreen-ratio"),
  neutralCount: $("#neutral-count"), actionStage: $("#action-stage"), previous: $("#previous-round"), next: $("#next-round"),
  play: $("#play-rounds"), slider: $("#round-slider"), roundMode: $("#round-mode"), explanation: $("#round-explanation"),
  sourceStep: $("#source-step"), actionCount: $("#action-count"), errorCount: $("#error-count"), roundTotal: $("#round-total"),
  roundList: $("#round-list"), taskOutcome: $("#task-outcome"), toast: $("#toast"),
};

const ACTION_LABELS = {
  browser_get_content: "Read page", browser_list_tabs: "List tabs", web_search: "Web search", read_file: "Read file",
  write_file: "Write file", final_answer: "Final answer", mcp_tool: "External tool", task_tracker: "Task tracker",
};
const MODEL_CLASSES = { gpt54: "model-gpt54", gpt55: "model-gpt55", opus48: "model-opus", sonnet46: "model-sonnet46" };

function actionLabel(value) {
  return ACTION_LABELS[value] || String(value || "unknown").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function formatTokens(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}m`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}k`;
  return number.toLocaleString();
}
function scoreLabel(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(number % 1 ? 1 : 0)} / 1` : "—";
}
function outcomeLabel(success) { return success ? "Successful" : "Unsuccessful"; }
function modeLabel(mode) { return mode === "onscreen" ? "Working on-screen" : mode === "offscreen" ? "Working off-screen" : "Neutral transition"; }
function modeExplanation(mode) {
  if (mode === "onscreen") return "This round interacts with or reads the browser interface.";
  if (mode === "offscreen") return "This round uses search, terminal, files, or another tool outside the visible browser interface.";
  return "This round records a final answer or another action outside the on/off-screen comparison.";
}
function showToast(message) {
  elements.toast.textContent = message; elements.toast.classList.add("visible");
  window.setTimeout(() => elements.toast.classList.remove("visible"), 1500);
}
function populateSelect(select, values) {
  for (const value of values) {
    const option = document.createElement("option"); option.value = value; option.textContent = value; select.append(option);
  }
}
function hashId() { return decodeURIComponent(location.hash.replace(/^#(?:trace=)?/, "")); }

function renderCatalog() {
  const query = elements.search.value.trim().toLowerCase();
  state.filtered = state.catalog.filter((trace) => {
    const matchesQuery = !query || `${trace.id} ${trace.model} task ${trace.task_number}`.toLowerCase().includes(query);
    const matchesModel = !elements.modelFilter.value || trace.model === elements.modelFilter.value;
    const matchesLevel = !elements.levelFilter.value || trace.level === elements.levelFilter.value;
    const matchesOutcome = !elements.outcomeFilter.value || (elements.outcomeFilter.value === "success") === trace.success;
    return matchesQuery && matchesModel && matchesLevel && matchesOutcome;
  });
  elements.count.textContent = state.filtered.length;
  elements.status.textContent = `${state.filtered.length} of ${state.catalog.length} traces`;
  elements.list.replaceChildren();
  for (const trace of state.filtered) {
    const item = document.createElement("li");
    item.className = `trace-item${trace.id === state.selected?.id ? " active" : ""}${trace.success ? "" : " gaia-unsuccessful"}`;
    const button = document.createElement("button"); button.type = "button";
    button.innerHTML = `<span class="item-number">${String(trace.task_number).padStart(2, "0")}</span><span class="item-copy"><span class="item-meta"><span class="item-badge ${MODEL_CLASSES[trace.model_key] || "model-other"}">${trace.model}</span><span class="item-badge level-${trace.level}">L${trace.level}</span></span><strong class="gaia-item-title">GAIA task ${String(trace.task_number).padStart(2, "0")}</strong><span class="gaia-item-subtitle">${trace.rounds} rounds · ${outcomeLabel(trace.success)}</span></span>`;
    button.addEventListener("click", () => selectTrace(trace)); item.append(button); elements.list.append(item);
  }
}

async function selectTrace(entry, replaceHash = false) {
  stopPlayback(); state.selected = entry; renderCatalog(); elements.status.textContent = `Loading ${entry.id}…`;
  try {
    const response = await fetch(new URL(entry.data_path, DATA_BASE));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.trace = await response.json(); state.roundIndex = 0;
    elements.empty.hidden = true; elements.content.hidden = false; renderTrace();
    history[replaceHash ? "replaceState" : "pushState"](null, "", `#trace=${encodeURIComponent(entry.id)}`);
    elements.status.textContent = `${state.filtered.length} of ${state.catalog.length} traces`;
  } catch (error) {
    elements.status.textContent = `Could not load trace: ${error.message}`;
  }
}

function renderTrace() {
  const trace = state.trace;
  elements.taskNumber.textContent = `Task ${String(trace.task_number).padStart(2, "0")}`;
  elements.model.textContent = trace.model; elements.model.className = `model-badge ${MODEL_CLASSES[trace.model_key] || "model-other"}`;
  elements.level.textContent = `GAIA Level ${trace.level}`; elements.level.className = `level-badge level-${trace.level}`;
  elements.attachment.hidden = !trace.has_attachment;
  elements.outcome.textContent = outcomeLabel(trace.success); elements.outcome.className = `outcome-badge outcome-${trace.success ? "success" : "unsuccessful"}`;
  elements.roundCount.textContent = trace.summary.rounds; elements.inputTokens.textContent = formatTokens(trace.tokens.input);
  elements.outputTokens.textContent = formatTokens(trace.tokens.output); elements.score.textContent = scoreLabel(trace.score); elements.traceId.textContent = trace.id;
  elements.taskOutcome.innerHTML = `<strong>${outcomeLabel(trace.success)}</strong><span> · score ${scoreLabel(trace.score)}</span>`;
  elements.roundTotal.textContent = `${trace.rounds.length} total`; elements.slider.max = Math.max(0, trace.rounds.length - 1);
  renderModeSummary(); renderRoundList(); renderRound();
}

function renderModeSummary() {
  const summary = state.trace.summary; const working = summary.onscreen_rounds + summary.offscreen_rounds;
  const onPercent = working ? Math.round(100 * summary.onscreen_rounds / working) : 0; const offPercent = working ? 100 - onPercent : 0;
  elements.onscreenRatio.textContent = `On-screen ${onPercent}%`; elements.offscreenRatio.textContent = `Off-screen ${offPercent}%`;
  elements.neutralCount.textContent = `Neutral ${summary.neutral_rounds}`;
  const colors = { onscreen: "var(--mode-gui)", offscreen: "var(--mode-offscreen)", neutral: "var(--mode-neutral)" };
  const width = 100 / Math.max(1, state.trace.rounds.length);
  const stops = state.trace.rounds.flatMap((round, index) => [`${colors[round.work_mode]} ${(index * width).toFixed(3)}%`, `${colors[round.work_mode]} ${((index + 1) * width).toFixed(3)}%`]);
  elements.slider.style.setProperty("--mode-gradient", `linear-gradient(to right, ${stops.join(",")})`);
}

function renderRoundList() {
  elements.roundList.replaceChildren();
  state.trace.rounds.forEach((round, index) => {
    const item = document.createElement("li");
    const title = round.actions.map((action) => actionLabel(action.type)).join(" → ");
    const hasError = round.actions.some((action) => action.has_error);
    const modeClass = round.work_mode === "onscreen" ? "mode-gui" : `mode-${round.work_mode}`;
    item.innerHTML = `<button class="round-link ${modeClass}${index === state.roundIndex ? " active" : ""}" type="button"><span class="round-index">${index + 1}</span><div class="round-copy"><strong>${title || "Recorded step"}</strong><span>${round.actions.length} action${round.actions.length === 1 ? "" : "s"}${hasError ? " · error" : ""}</span></div></button>`;
    item.querySelector("button").addEventListener("click", () => { state.roundIndex = index; renderRoundList(); renderRound(); });
    elements.roundList.append(item);
  });
}

function renderRound() {
  const round = state.trace.rounds[state.roundIndex]; if (!round) return;
  elements.slider.value = state.roundIndex; elements.roundPosition.textContent = `Round ${state.roundIndex + 1} of ${state.trace.rounds.length}`;
  elements.roundTitle.textContent = round.actions.map((action) => actionLabel(action.type)).join(" → ") || "Recorded step";
  elements.actionStage.innerHTML = `<div class="action-sequence">${round.actions.map((action, index) => `<article class="action-node ${round.work_mode}${action.has_error ? " has-error" : ""}"><span class="node-index">ACTION ${String(index + 1).padStart(2, "0")}</span><strong>${actionLabel(action.type)}</strong><span>${action.channel} channel</span></article>`).join("")}</div><p class="withheld-caption">Action arguments and observations are withheld from this public view.</p>`;
  elements.roundMode.textContent = modeLabel(round.work_mode); elements.explanation.textContent = modeExplanation(round.work_mode);
  elements.sourceStep.textContent = round.source_step; elements.actionCount.textContent = round.actions.length;
  elements.errorCount.textContent = round.actions.filter((action) => action.has_error).length;
  elements.previous.disabled = state.roundIndex === 0; elements.next.disabled = state.roundIndex === state.trace.rounds.length - 1;
  elements.roundList.querySelectorAll(".round-link").forEach((item, index) => item.classList.toggle("active", index === state.roundIndex));
  elements.roundList.children[state.roundIndex]?.scrollIntoView({ block: "nearest" });
}

function stopPlayback() { if (state.timer) window.clearInterval(state.timer); state.timer = null; elements.play.innerHTML = "<span>▶</span> Play"; }
function togglePlayback() {
  if (state.timer) { stopPlayback(); return; }
  elements.play.innerHTML = "<span>Ⅱ</span> Pause";
  state.timer = window.setInterval(() => {
    if (state.roundIndex >= state.trace.rounds.length - 1) { stopPlayback(); return; }
    state.roundIndex += 1; renderRoundList(); renderRound();
  }, state.delay);
}

async function init() {
  try {
    const response = await fetch(new URL("catalog.json", DATA_BASE)); if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json(); state.catalog = data.traces;
    elements.note.textContent = `${data.sample.tasks} paired tasks · ${data.models.length} models · Levels ${Object.entries(data.sample.level_quotas).map(([level, count]) => `${level}: ${count}`).join(", ")}`;
    populateSelect(elements.modelFilter, [...new Set(state.catalog.map((trace) => trace.model))]);
    populateSelect(elements.levelFilter, [...new Set(state.catalog.map((trace) => trace.level))].sort().map((level) => `Level ${level}`));
    [...elements.levelFilter.options].forEach((option) => { if (option.value.startsWith("Level ")) option.value = option.value.slice(6); });
    renderCatalog(); const requested = state.catalog.find((trace) => trace.id === hashId());
    await selectTrace(requested || state.catalog[0], true);
  } catch (error) { elements.status.textContent = `Could not load GAIA catalog: ${error.message}`; }
}

[elements.search, elements.modelFilter, elements.levelFilter, elements.outcomeFilter].forEach((element) => element.addEventListener(element.tagName === "INPUT" ? "input" : "change", renderCatalog));
elements.previous.addEventListener("click", () => { stopPlayback(); state.roundIndex = Math.max(0, state.roundIndex - 1); renderRoundList(); renderRound(); });
elements.next.addEventListener("click", () => { stopPlayback(); state.roundIndex = Math.min(state.trace.rounds.length - 1, state.roundIndex + 1); renderRoundList(); renderRound(); });
elements.play.addEventListener("click", togglePlayback);
elements.slider.addEventListener("input", () => { stopPlayback(); state.roundIndex = Number(elements.slider.value); renderRoundList(); renderRound(); });
document.querySelectorAll("[data-speed]").forEach((button) => button.addEventListener("click", () => { state.delay = Number(button.dataset.speed); document.querySelectorAll("[data-speed]").forEach((item) => item.classList.toggle("active", item === button)); if (state.timer) { stopPlayback(); togglePlayback(); } }));
elements.copyId.addEventListener("click", async () => { await navigator.clipboard.writeText(state.trace.id); showToast("Public trace ID copied"); });
window.addEventListener("hashchange", () => { const entry = state.catalog.find((trace) => trace.id === hashId()); if (entry && entry.id !== state.selected?.id) selectTrace(entry, true); });
init();
