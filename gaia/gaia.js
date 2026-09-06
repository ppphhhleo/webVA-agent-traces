const CONFIG = window.TRACE_COLLECTION_CONFIG || {};
const PRIVATE_MODE = Boolean(CONFIG.privateGaia);
const DATA_BASE = CONFIG.gaiaDataBaseUrl
  ? new URL(CONFIG.gaiaDataBaseUrl, window.location.href)
  : new URL("gaia/", new URL(CONFIG.dataBaseUrl || "../data/", window.location.href));

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
  privateBanner: $("#private-mode-banner"), redactionNote: $("#redaction-note"), privatePrompt: $("#private-task-prompt"),
  privateTaskText: $("#private-task-text"), privateAttachment: $("#private-attachment-line"), privateRound: $("#private-round-content"),
  privateReasoning: $("#private-reasoning-body"), privateTools: $("#private-tool-body"), withheldAnswer: $("#withheld-answer-note"),
  privateReview: $("#private-review"), privateReviewText: $("#private-review-text"),
};

const ACTION_LABELS = {
  browser_get_content: "Read page", browser_list_tabs: "List tabs", web_search: "Web search", read_file: "Read file",
  write_file: "Write file", final_answer: "Final answer", mcp_tool: "External tool", task_tracker: "Task tracker",
};
const MODEL_CLASSES = { gpt54: "model-gpt54", gpt55: "model-gpt55", opus48: "model-opus", sonnet46: "model-sonnet46" };

function actionLabel(value) {
  return ACTION_LABELS[value] || String(value || "unknown").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}
function compact(value, length = 94) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized.length > length ? `${normalized.slice(0, length - 1)}…` : normalized;
}
function formatDetail(value) {
  if (value === null || value === undefined || value === "") return "Not recorded.";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
function actionHasError(action) { return Boolean(action?.has_error || action?.error); }
function roundTitle(round) {
  const actions = (round.actions || []).map((action) => actionLabel(action.type)).join(" → ");
  if (actions) return actions;
  if (round.reasoning) return "Reasoning";
  if (round.user_message) return "User message";
  return "Recorded step";
}
function traceSummary(trace) {
  if (trace.summary) return trace.summary;
  const counts = { onscreen: 0, offscreen: 0, neutral: 0 };
  for (const round of trace.rounds || []) counts[round.work_mode] = (counts[round.work_mode] || 0) + 1;
  return {
    rounds: (trace.rounds || []).length,
    onscreen_rounds: counts.onscreen,
    offscreen_rounds: counts.offscreen,
    neutral_rounds: counts.neutral,
  };
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
    const matchesQuery = !query || `${trace.id} ${trace.model} task ${trace.task_number} ${PRIVATE_MODE ? trace.task_prompt || "" : ""}`.toLowerCase().includes(query);
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
    const title = PRIVATE_MODE && trace.task_prompt ? compact(trace.task_prompt) : `GAIA task ${String(trace.task_number).padStart(2, "0")}`;
    button.innerHTML = `<span class="item-number">${String(trace.task_number).padStart(2, "0")}</span><span class="item-copy"><span class="item-meta"><span class="item-badge ${MODEL_CLASSES[trace.model_key] || "model-other"}">${escapeHtml(trace.model)}</span><span class="item-badge level-${trace.level}">L${escapeHtml(trace.level)}</span></span><strong class="gaia-item-title">${escapeHtml(title)}</strong><span class="gaia-item-subtitle">${trace.rounds} rounds · ${outcomeLabel(trace.success)}</span></span>`;
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
  const summary = traceSummary(trace);
  elements.taskNumber.textContent = `Task ${String(trace.task_number).padStart(2, "0")}`;
  elements.model.textContent = trace.model; elements.model.className = `model-badge ${MODEL_CLASSES[trace.model_key] || "model-other"}`;
  elements.level.textContent = `GAIA Level ${trace.level}`; elements.level.className = `level-badge level-${trace.level}`;
  elements.attachment.hidden = !(trace.has_attachment || trace.attachment_name);
  elements.outcome.textContent = outcomeLabel(trace.success); elements.outcome.className = `outcome-badge outcome-${trace.success ? "success" : "unsuccessful"}`;
  elements.roundCount.textContent = summary.rounds; elements.inputTokens.textContent = formatTokens(trace.tokens.input);
  elements.outputTokens.textContent = formatTokens(trace.tokens.output); elements.score.textContent = scoreLabel(trace.score); elements.traceId.textContent = trace.id;
  renderPrivateTraceContent(trace);
  elements.roundTotal.textContent = `${trace.rounds.length} total`; elements.slider.max = Math.max(0, trace.rounds.length - 1);
  renderModeSummary(); renderRoundList(); renderRound();
}

function renderPrivateTraceContent(trace) {
  elements.privateBanner.hidden = !PRIVATE_MODE;
  elements.redactionNote.hidden = PRIVATE_MODE;
  elements.privatePrompt.hidden = !PRIVATE_MODE;
  elements.privateRound.hidden = !PRIVATE_MODE;
  elements.privateReview.hidden = !PRIVATE_MODE || !trace.review;
  elements.withheldAnswer.hidden = PRIVATE_MODE;
  if (!PRIVATE_MODE) {
    elements.taskOutcome.innerHTML = `<strong>${outcomeLabel(trace.success)}</strong><span> · score ${scoreLabel(trace.score)}</span>`;
    return;
  }
  elements.privateTaskText.textContent = trace.task_prompt || "Task prompt not recorded.";
  elements.privateAttachment.hidden = !trace.attachment_name;
  elements.privateAttachment.textContent = trace.attachment_name ? `Attachment: ${trace.attachment_name}` : "";
  elements.privateReviewText.textContent = formatDetail(trace.review);
  const answers = trace.answers || {};
  elements.taskOutcome.replaceChildren();
  const outcome = document.createElement("div");
  outcome.innerHTML = `<strong>${outcomeLabel(trace.success)}</strong><span> · score ${scoreLabel(trace.score)}</span>`;
  elements.taskOutcome.append(outcome);
  const answerFields = [
    ["Model answer", answers.model_answer],
    ["Ground truth", answers.ground_truth],
    ["Model raw output", answers.model_answer_raw],
    ["Final raw output", answers.final_answer],
  ];
  const renderedAnswers = new Set();
  for (const [label, value] of answerFields) {
    if (value === null || value === undefined || value === "") continue;
    const normalized = formatDetail(value);
    if (renderedAnswers.has(normalized)) continue;
    renderedAnswers.add(normalized);
    const block = document.createElement("div"); block.className = "private-answer-block";
    const heading = document.createElement("strong"); heading.textContent = label;
    const body = document.createElement("pre"); body.textContent = normalized;
    block.append(heading, body); elements.taskOutcome.append(block);
  }
}

function renderModeSummary() {
  const summary = traceSummary(state.trace); const working = summary.onscreen_rounds + summary.offscreen_rounds;
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
    const title = roundTitle(round);
    const hasError = (round.actions || []).some(actionHasError);
    const modeClass = round.work_mode === "onscreen" ? "mode-gui" : `mode-${round.work_mode}`;
    const actions = round.actions || [];
    item.innerHTML = `<button class="round-link ${modeClass}${index === state.roundIndex ? " active" : ""}" type="button"><span class="round-index">${index + 1}</span><div class="round-copy"><strong>${escapeHtml(title)}</strong><span>${actions.length} action${actions.length === 1 ? "" : "s"}${hasError ? " · error" : ""}</span></div></button>`;
    item.querySelector("button").addEventListener("click", () => { state.roundIndex = index; renderRoundList(); renderRound(); });
    elements.roundList.append(item);
  });
}

function renderRound() {
  const round = state.trace.rounds[state.roundIndex]; if (!round) return;
  elements.slider.value = state.roundIndex; elements.roundPosition.textContent = `Round ${state.roundIndex + 1} of ${state.trace.rounds.length}`;
  const actions = round.actions || [];
  elements.roundTitle.textContent = roundTitle(round);
  elements.actionStage.innerHTML = `<div class="action-sequence">${actions.map((action, index) => `<article class="action-node ${round.work_mode}${actionHasError(action) ? " has-error" : ""}"><span class="node-index">ACTION ${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(actionLabel(action.type))}</strong><span>${escapeHtml(action.channel)} channel</span></article>`).join("")}</div><p class="withheld-caption">${PRIVATE_MODE ? "Select a round to inspect its complete reasoning, arguments, and observations below." : "Action arguments and observations are withheld from this public view."}</p>`;
  elements.roundMode.textContent = modeLabel(round.work_mode); elements.explanation.textContent = modeExplanation(round.work_mode);
  elements.sourceStep.textContent = round.source_step; elements.actionCount.textContent = actions.length;
  elements.errorCount.textContent = actions.filter(actionHasError).length;
  renderPrivateRound(round);
  elements.previous.disabled = state.roundIndex === 0; elements.next.disabled = state.roundIndex === state.trace.rounds.length - 1;
  elements.roundList.querySelectorAll(".round-link").forEach((item, index) => item.classList.toggle("active", index === state.roundIndex));
  elements.roundList.children[state.roundIndex]?.scrollIntoView({ block: "nearest" });
}

function renderPrivateRound(round) {
  if (!PRIVATE_MODE) return;
  elements.privateReasoning.replaceChildren();
  for (const [label, value] of [["User message", round.user_message], ["Model reasoning", round.reasoning]]) {
    if (!value) continue;
    const heading = document.createElement("strong"); heading.textContent = label;
    const body = document.createElement("pre"); body.textContent = value;
    elements.privateReasoning.append(heading, body);
  }
  if (!elements.privateReasoning.children.length) elements.privateReasoning.textContent = "No reasoning or message was recorded for this round.";

  elements.privateTools.replaceChildren();
  (round.actions || []).forEach((action, index) => {
    const details = document.createElement("details"); details.open = index === 0;
    const summary = document.createElement("summary"); summary.textContent = `${index + 1}. ${actionLabel(action.type)} · ${action.channel || "unknown"}`;
    const body = document.createElement("div");
    for (const [label, value, className] of [["Arguments", action.arguments, ""], ["Observation", action.observation, ""], ["Error", action.error, "tool-error"]]) {
      if (value === null || value === undefined || value === "") continue;
      const heading = document.createElement("strong"); heading.textContent = label;
      const output = document.createElement("pre"); output.textContent = formatDetail(value); if (className) output.className = className;
      body.append(heading, output);
    }
    details.append(summary, body); elements.privateTools.append(details);
  });
  for (const path of round.screenshots || []) {
    const image = document.createElement("img"); image.className = "private-screenshot"; image.alt = `Screenshot from round ${round.round}`; image.src = new URL(path, DATA_BASE).href;
    elements.privateTools.append(image);
  }
  if (!elements.privateTools.children.length) elements.privateTools.textContent = "No tool action or screenshot was recorded for this round.";
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
    const modelCount = new Set(state.catalog.map((trace) => trace.model)).size;
    elements.note.textContent = `${data.sample.tasks} paired tasks · ${modelCount} models · Levels ${Object.entries(data.sample.level_quotas).map(([level, count]) => `${level}: ${count}`).join(", ")}${PRIVATE_MODE ? " · private full-content mode" : ""}`;
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
elements.copyId.addEventListener("click", async () => { await navigator.clipboard.writeText(state.trace.id); showToast(`${PRIVATE_MODE ? "Trace" : "Public trace"} ID copied`); });
window.addEventListener("hashchange", () => { const entry = state.catalog.find((trace) => trace.id === hashId()); if (entry && entry.id !== state.selected?.id) selectTrace(entry, true); });
init();
