const MODEL_COLORS = {
  "GPT-5.5": "#e69f00",
  "GPT-5.4": "#0072b2",
  "Claude Opus 4.8": "#cc79a7",
  "Claude Sonnet 5": "#009e73",
};
const MODEL_ORDER = ["GPT-5.4", "GPT-5.5", "Claude Opus 4.8", "Claude Sonnet 5"];
const TASK_TYPE_ORDER = ["Low-level", "Compound", "High-level"];
const FRICTION_COLORS = {
  "Misgrounded manipulation": "#e69f00",
  "Repetition loop": "#56b4e9",
};
const LANDING_COLORS = {
  "Grounded visual evidence": "#009e73",
  "Combined visual + computed": "#56b4e9",
  "Computed evidence": "#0072b2",
  "Prior-knowledge answer": "#cc79a7",
  "Misgrounded evidence": "#e69f00",
  "Fabricated evidence": "#d55e00",
  "No answer": "#666666",
};
const HANDLING_COLORS = {
  "Recovered in GUI": "#009e73",
  "Shifted to code": "#0072b2",
  "Mixed GUI + code": "#cc79a7",
  "Finished without GUI repair": "#d55e00",
  "Unresolved / abandoned": "#666666",
};

const state = { traces: [], friction: null, evidence: null, evidenceModel: "", activeModels: new Set(), taskType: "" };
const svg = document.querySelector("#scatterplot");
const tooltip = document.querySelector("#plot-tooltip");
const legend = document.querySelector("#model-legend");
const taskFilter = document.querySelector("#task-type-filter");
const performanceBody = document.querySelector("#performance-summary");
const workShareChart = document.querySelector("#work-share-chart");
const frictionSvg = document.querySelector("#friction-alluvial");
const alluvialTooltip = document.querySelector("#alluvial-tooltip");
const evidenceSvg = document.querySelector("#evidence-plot");
const evidenceTooltip = document.querySelector("#evidence-tooltip");
const evidenceLegend = document.querySelector("#evidence-legend");

const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const numeric = (values) => values.filter((value) => Number.isFinite(value));
const formatMean = (value, digits = 1) => value === null ? "—" : value.toLocaleString(undefined, {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
});
const formatTokens = (value) => value === null ? "—" : Math.round(value).toLocaleString();

const percent = (value) => value === null || value === undefined ? "Never" : `${value.toFixed(1)}%`;
const colorFor = (model) => MODEL_COLORS[model] || "#687777";
const orderedModels = (traces) => [...new Set(traces.map((trace) => trace.model))]
  .sort((a, b) => MODEL_ORDER.indexOf(a) - MODEL_ORDER.indexOf(b));
const svgElement = (name, attributes = {}) => {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
};
const clamp = (value, lower, upper) => Math.max(lower, Math.min(upper, value));
const stableHash = (value) => [...value].reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0, 2166136261);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
})[character]);
const positionRelativeTooltip = (event, element, tooltipWidth = 284) => {
  const shell = element.parentElement.getBoundingClientRect();
  const target = event.currentTarget?.getBoundingClientRect();
  const clientX = Number.isFinite(event.clientX) ? event.clientX : target.left + target.width / 2;
  const clientY = Number.isFinite(event.clientY) ? event.clientY : target.top + target.height / 2;
  element.style.left = `${clamp(clientX - shell.left + 14, 8, shell.width - tooltipWidth)}px`;
  element.style.top = `${Math.max(8, clientY - shell.top - 35)}px`;
};

function visibleTraces() {
  return state.traces.filter((trace) =>
    state.activeModels.has(trace.model) && (!state.taskType || trace.task_type === state.taskType)
  );
}

function renderLegend() {
  const models = orderedModels(state.traces);
  legend.replaceChildren(...models.map((model) => {
    const count = state.traces.filter((trace) => trace.model === model).length;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "legend-toggle";
    button.style.setProperty("--series-color", colorFor(model));
    button.setAttribute("aria-pressed", state.activeModels.has(model));
    button.innerHTML = `<i></i>${model}<span>${count}</span>`;
    button.addEventListener("click", () => {
      state.activeModels.has(model) ? state.activeModels.delete(model) : state.activeModels.add(model);
      renderLegend();
      renderChart();
    });
    return button;
  }));
}

function tooltipHtml(trace) {
  const first = trace.first_offscreen_round
    ? `Round ${trace.first_offscreen_round} of ${trace.total_rounds} (${percent(trace.first_offscreen_position_percent)})`
    : "Never";
  const visibilityNote = trace.visibility_basis === "answer_only_convention"
    ? "<br><em>Answer-only trace: 100% visible by convention</em>"
    : "";
  return `<strong>Trace ${trace.trace_number} · Task ${trace.task_id}</strong>
    <p><b>${trace.model}</b><br>${trace.task_type}<br>
    Off-screen share: <b>${percent(trace.offscreen_percent)}</b><br>
    GUI share: <b>${percent(trace.gui_percent)}</b><br>
    First off-screen: <b>${first}</b><br>
    ${trace.offscreen_rounds} off-screen · ${trace.gui_rounds} GUI · ${trace.neutral_rounds} neutral${visibilityNote}</p>`;
}

function showTooltip(event, trace) {
  tooltip.innerHTML = tooltipHtml(trace);
  tooltip.hidden = false;
  const shell = tooltip.parentElement.getBoundingClientRect();
  const left = Math.min(event.clientX - shell.left + 14, shell.width - 274);
  const top = Math.max(8, event.clientY - shell.top - 30);
  tooltip.style.left = `${Math.max(8, left)}px`;
  tooltip.style.top = `${top}px`;
}

function renderChart() {
  const traces = visibleTraces();
  const width = Math.max(340, svg.clientWidth || 1000);
  const height = svg.clientHeight || 610;
  const mobile = width < 620;
  const margin = mobile
    ? { top: 28, right: 25, bottom: 78, left: 58 }
    : { top: 30, right: 62, bottom: 76, left: 76 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const x = (value) => margin.left + (value / 100) * plotWidth;
  const y = (value) => margin.top + plotHeight - (value / 100) * plotHeight;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.replaceChildren();

  [0, 25, 50, 75, 100].forEach((tick) => {
    svg.append(svgElement("line", { class: "grid-line", x1: margin.left, x2: margin.left + plotWidth, y1: y(tick), y2: y(tick) }));
    const label = svgElement("text", { class: "tick-label", x: margin.left - 11, y: y(tick) + 3, "text-anchor": "end" });
    label.textContent = `${tick}%`;
    svg.append(label);
  });

  [0, 25, 50, 75, 100].forEach((tick) => {
    const label = svgElement("text", { class: "tick-label", x: x(tick), y: margin.top + plotHeight + 23, "text-anchor": "middle" });
    label.textContent = `${tick}%`;
    svg.append(label);
  });

  svg.append(svgElement("line", { class: "axis-line", x1: margin.left, x2: margin.left + plotWidth, y1: margin.top + plotHeight, y2: margin.top + plotHeight }));
  svg.append(svgElement("line", { class: "axis-line", x1: margin.left, x2: margin.left, y1: margin.top, y2: margin.top + plotHeight }));

  const xLabel = svgElement("text", { class: "axis-label", x: margin.left + plotWidth / 2, y: height - 21, "text-anchor": "middle" });
  xLabel.textContent = "Off-screen share of working rounds";
  svg.append(xLabel);
  const yLabel = svgElement("text", { class: "axis-label", transform: `translate(18 ${margin.top + plotHeight / 2}) rotate(-90)`, "text-anchor": "middle" });
  yLabel.textContent = "Off-screen delay (% of all rounds)";
  svg.append(yLabel);

  const topHint = svgElement("text", { class: "axis-hint", x: margin.left + plotWidth - 6, y: margin.top + 14, "text-anchor": "end" });
  topHint.textContent = "Later shift · never at top";
  svg.append(topHint);
  const bottomHint = svgElement("text", { class: "axis-hint", x: margin.left + plotWidth - 6, y: margin.top + plotHeight - 9, "text-anchor": "end" });
  bottomHint.textContent = "Earlier shift";
  svg.append(bottomHint);

  const visibleModels = orderedModels(traces);
  const neverByModel = new Map(visibleModels.map((model) => [
    model,
    traces.filter((trace) => trace.model === model && trace.first_offscreen_round === null),
  ]));

  traces.forEach((trace) => {
    const isNever = trace.first_offscreen_round === null;
    let pointX = x(trace.offscreen_percent);
    let pointY = y(trace.first_offscreen_position_percent ?? 100);
    if (isNever) {
      const modelIndex = visibleModels.indexOf(trace.model);
      const modelRows = neverByModel.get(trace.model) || [];
      const itemIndex = modelRows.indexOf(trace);
      const groupWidth = mobile ? 4 : 7;
      const groupCenter = margin.left + 5 + groupWidth * modelIndex;
      const jitter = mobile ? 1 : 1.5;
      pointX = groupCenter + ((itemIndex % 3) - 1) * jitter;
      pointY = margin.top + 4 + Math.floor(itemIndex / 3) * (mobile ? 3.4 : 4.4);
    }
    const point = svgElement("circle", {
      class: "trace-point",
      cx: pointX,
      cy: pointY,
      r: isNever ? (mobile ? 3.1 : 3.8) : (mobile ? 4.2 : 5.2),
      fill: colorFor(trace.model),
      "data-never": isNever ? "true" : "false",
      tabindex: 0,
      role: "link",
      "aria-label": `Trace ${trace.trace_number}, ${trace.model}, ${trace.offscreen_percent}% off-screen share, ${trace.first_offscreen_position_percent ?? 100}% delay`,
    });
    point.addEventListener("pointerenter", (event) => showTooltip(event, trace));
    point.addEventListener("pointermove", (event) => showTooltip(event, trace));
    point.addEventListener("pointerleave", () => { tooltip.hidden = true; });
    point.addEventListener("focus", () => {
      const rect = point.getBoundingClientRect();
      showTooltip({ clientX: rect.left, clientY: rect.top }, trace);
    });
    point.addEventListener("blur", () => { tooltip.hidden = true; });
    const openTrace = () => {
      window.location.href = `../#trace=${encodeURIComponent(trace.trace_id)}`;
    };
    point.addEventListener("click", openTrace);
    point.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openTrace();
    });
    svg.append(point);
  });
}

function renderPerformanceSummary() {
  performanceBody.replaceChildren(...orderedModels(state.traces).map((model) => {
    const rows = state.traces.filter((trace) => trace.model === model);
    const scores = numeric(rows.map((trace) => trace.task_score));
    const row = document.createElement("tr");
    row.innerHTML = `<td><span class="model-key" style="--series-color:${colorFor(model)}"><i></i>${model}</span></td>
      <td class="metric-value">${rows.length}</td>
      <td class="metric-value score-value">${formatMean(mean(scores), 2)}</td>
      <td class="metric-value coverage-value">${scores.length}/${rows.length}</td>
      <td class="metric-value">${formatTokens(mean(numeric(rows.map((trace) => trace.input_tokens))))}</td>
      <td class="metric-value">${formatTokens(mean(numeric(rows.map((trace) => trace.output_tokens))))}</td>
      <td class="metric-value">${formatTokens(mean(numeric(rows.map((trace) => trace.total_tokens))))}</td>
      <td class="metric-value">${formatMean(mean(numeric(rows.map((trace) => trace.action_count))))}</td>
      <td class="metric-value">${formatMean(mean(numeric(rows.map((trace) => trace.total_rounds))))}</td>`;
    return row;
  }));
}

function renderWorkShareChart() {
  const models = orderedModels(state.traces);
  const taskTypes = ["Overall", ...[...new Set(state.traces.map((trace) => trace.task_type).filter(Boolean))]
    .sort((a, b) => TASK_TYPE_ORDER.indexOf(a) - TASK_TYPE_ORDER.indexOf(b))];

  workShareChart.replaceChildren(...taskTypes.map((taskType) => {
    const group = document.createElement("section");
    group.className = `share-group${taskType === "Overall" ? " share-overall" : ""}`;
    const title = document.createElement("h3");
    title.textContent = taskType;
    const rows = document.createElement("div");
    rows.className = "share-rows";
    rows.replaceChildren(...models.map((model) => {
      const traces = state.traces.filter((trace) =>
        trace.model === model && (taskType === "Overall" || trace.task_type === taskType)
      );
      const offscreen = mean(numeric(traces.map((trace) => trace.offscreen_percent))) || 0;
      const onscreen = 100 - offscreen;
      const positions = traces.map((trace) => Number.isFinite(trace.first_offscreen_position_percent)
        ? trace.first_offscreen_position_percent
        : 100);
      const switchLatency = mean(positions) || 0;
      const never = traces.filter((trace) => trace.first_offscreen_round === null).length;
      const edgeClass = switchLatency >= 88 ? " edge-right" : switchLatency <= 12 ? " edge-left" : "";
      const row = document.createElement("div");
      row.className = "share-row";
      row.innerHTML = `<div class="share-label"><span class="model-key" style="--series-color:${colorFor(model)}"><i></i>${model}</span><small>n=${traces.length}</small></div>
        <div class="metric-caption"><span>Working rounds</span></div>
        <div class="share-track" aria-label="${model}, ${taskType}: ${onscreen.toFixed(1)}% on screen and ${offscreen.toFixed(1)}% off screen">
          <div class="share-segment share-on" style="width:${onscreen}%">${onscreen >= 14 ? `${onscreen.toFixed(1)}%` : ""}</div>
          <div class="share-segment share-off" style="width:${offscreen}%">${offscreen >= 14 ? `${offscreen.toFixed(1)}%` : ""}</div>
        </div>
        <div class="metric-caption onset-caption"><span>Off-screen onset</span><small>never ${never}/${traces.length}</small></div>
        <div class="delay-track" aria-label="${model}, ${taskType}: mean off-screen switch latency ${switchLatency.toFixed(1)}%; lower is faster; ${never} of ${traces.length} traces never went off screen">
          <span class="delay-fill" style="width:${switchLatency}%;--series-color:${colorFor(model)}"></span>
          <i class="delay-dot" style="left:${switchLatency}%;--series-color:${colorFor(model)}"></i>
          <b class="delay-value${edgeClass}" style="left:${switchLatency}%">${switchLatency.toFixed(1)}%</b>
        </div>`;
      return row;
    }));
    const axis = document.createElement("div");
    axis.className = "delay-axis unified-delay-axis";
    axis.innerHTML = "<span>0% · faster</span><span>50%</span><span>100% · slower / never</span>";
    group.append(title, rows, axis);
    return group;
  }));
}

function modelStats(model) {
  const traces = state.traces.filter((trace) => trace.model === model);
  const positions = traces.map((trace) => Number.isFinite(trace.first_offscreen_position_percent)
    ? trace.first_offscreen_position_percent
    : 100);
  return {
    traces,
    count: traces.length,
    offscreen: mean(numeric(traces.map((trace) => trace.offscreen_percent))) || 0,
    latency: mean(positions) || 0,
    never: traces.filter((trace) => trace.first_offscreen_round === null).length,
    startsOffscreen: traces.filter((trace) => trace.first_offscreen_round === 1).length,
    rounds: mean(numeric(traces.map((trace) => trace.total_rounds))) || 0,
    unfinished: traces.filter((trace) => trace.completion_status === "unfinished").length,
  };
}

function taskTypeOffscreen(stats, taskType) {
  return mean(numeric(stats.traces
    .filter((trace) => trace.task_type === taskType)
    .map((trace) => trace.offscreen_percent))) || 0;
}

function renderBehavioralSignatures() {
  const gpt54 = modelStats("GPT-5.4");
  const gpt55 = modelStats("GPT-5.5");
  const opus = modelStats("Claude Opus 4.8");
  const sonnet = modelStats("Claude Sonnet 5");
  const perModel = state.activeModels.size ? state.traces.length / state.activeModels.size : 0;
  document.querySelector("#cohort-summary").textContent = `${perModel} unique trial-one traces per model.`;
  document.querySelector("#signature-gpt54").textContent = `It averages ${gpt54.offscreen.toFixed(1)}% of working rounds off screen, and ${gpt54.never} of ${gpt54.count} traces never leave the interface. Its mean switch latency is ${gpt54.latency.toFixed(1)}%. Visible persistence does not always produce the right answer.`;
  document.querySelector("#signature-gpt55").textContent = `It averages ${gpt55.offscreen.toFixed(1)}% of working rounds off screen, starts there in ${gpt55.startsOffscreen} of ${gpt55.count} traces, and has a mean switch latency of ${gpt55.latency.toFixed(1)}%. A characteristic run searches bundles, opens Chrome remote debugging, and parses recovered data in code.`;
  document.querySelector("#signature-opus").textContent = `Its off-screen share changes from ${taskTypeOffscreen(opus, "Low-level").toFixed(1)}% on low-level tasks to ${taskTypeOffscreen(opus, "Compound").toFixed(1)}% on compound tasks, while its overall mean switch latency is ${opus.latency.toFixed(1)}%. It often begins visually, then moves to Python or shell when exact aggregation is useful.`;
  document.querySelector("#signature-sonnet").textContent = `It keeps ${(100 - sonnet.offscreen).toFixed(1)}% of working rounds on screen and has a mean switch latency of ${sonnet.latency.toFixed(1)}%, compared with ${opus.latency.toFixed(1)}% for Opus. Its traces average ${sonnet.rounds.toFixed(1)} rounds, with ${sonnet.unfinished} unfinished.`;
}

function frictionColor(stage, label, episodes = []) {
  if (stage === "friction") return FRICTION_COLORS[label] || "#687777";
  if (stage === "handling") return HANDLING_COLORS[label] || "#687777";
  if (stage === "landing") return LANDING_COLORS[label] || "#687777";
  const handling = episodes.find((episode) => episode.handling === label)?.handling;
  return HANDLING_COLORS[handling] || "#687777";
}

function pathwayBreakdown(episodes) {
  const counts = new Map();
  episodes.forEach((episode) => counts.set(episode.pathway, (counts.get(episode.pathway) || 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, count]) => `${label} (${count})`)
    .join("<br>");
}

function showAlluvialTooltip(event, title, count, traceIds, detail = "") {
  const total = state.friction?.counts?.episodes || 1;
  const shown = traceIds.slice(0, 4);
  alluvialTooltip.innerHTML = `<strong>${title}</strong>
    <p><b>${count} episode${count === 1 ? "" : "s"}</b> · ${(count / total * 100).toFixed(1)}%${detail ? `<br>${detail}` : ""}<br>
    ${shown.join(" · ")}${traceIds.length > shown.length ? `<br>+${traceIds.length - shown.length} more traces` : ""}</p>`;
  alluvialTooltip.hidden = false;
  const shell = alluvialTooltip.parentElement.getBoundingClientRect();
  const left = Math.min(event.clientX - shell.left + 14, shell.width - 290);
  const top = Math.max(8, event.clientY - shell.top - 34);
  alluvialTooltip.style.left = `${Math.max(8, left)}px`;
  alluvialTooltip.style.top = `${top}px`;
}

function renderFrictionSummary() {
  const data = state.friction;
  if (!data) return;
  const total = data.counts.episodes;
  const offscreen = data.counts.used_offscreen;
  const continued = data.counts.continued_without_repair;
  const unresolved = data.counts.unresolved_or_abandoned;
  document.querySelector("#friction-episodes").textContent = total;
  document.querySelector("#friction-offscreen").textContent = `${offscreen} · ${(offscreen / total * 100).toFixed(0)}%`;
  document.querySelector("#friction-unseen").textContent = `${continued + unresolved} · ${((continued + unresolved) / total * 100).toFixed(0)}%`;
  document.querySelector("#friction-callout").innerHTML = `<strong>One friction episode can cross channels more than once.</strong>
    Of ${total} coded episodes, ${offscreen} use off-screen work somewhere in the handling path; ${continued} finish without repairing the interface, while ${unresolved} remain unresolved or are abandoned. Detailed sequences remain in the trace cards and hover descriptions.`;

  const examples = document.querySelector("#friction-examples");
  examples.replaceChildren(...(data.case_studies || []).map((example) => {
    const link = document.createElement("a");
    link.href = `../#trace=${encodeURIComponent(example.trace_id)}`;
    const episode = data.episodes.find((item) => item.trace_id === example.trace_id);
    link.style.setProperty("--path-color", HANDLING_COLORS[episode?.handling] || "#68706d");
    const steps = example.steps.map((step) => `<span class="path-step path-${step.kind}"><b>${step.rounds}</b>${step.label}</span>`).join("");
    link.innerHTML = `<div class="example-heading"><i></i><span>${example.label}</span><code>${example.trace_id}</code></div>
      <p>${example.summary}</p><div class="path-steps">${steps}</div><strong>${example.why}</strong>`;
    link.title = episode ? `${episode.friction} → ${episode.pathway} → ${episode.landing}` : example.label;
    return link;
  }));
}

function renderFrictionAlluvial() {
  const data = state.friction;
  if (!data || !frictionSvg) return;
  const width = 1280;
  const height = 520;
  const top = 62;
  const bottom = 26;
  const plotHeight = height - top - bottom;
  const nodeWidth = 12;
  const stageKeys = ["friction", "handling", "landing"];
  const stageTitles = ["GUI friction", "How it was handled", "Evidence landing"];
  const stageX = [164, 640, 1050];
  const nodeMap = new Map();
  const stages = {};
  const activeLabels = {};

  stageKeys.forEach((stage) => {
    const counts = data.stage_counts[stage] || {};
    const ordered = (data.stage_orders[stage] || []).filter((label) => counts[label]);
    const extras = Object.keys(counts).filter((label) => !ordered.includes(label));
    activeLabels[stage] = [...ordered, ...extras];
  });
  const maxGapSpace = Math.max(...stageKeys.map((stage) => Math.max(0, activeLabels[stage].length - 1) * 9));
  const unit = (plotHeight - maxGapSpace) / data.counts.episodes;

  stageKeys.forEach((stage, stageIndex) => {
    const labels = activeLabels[stage];
    const gap = labels.length > 8 ? 9 : 15;
    const usedHeight = data.counts.episodes * unit + Math.max(0, labels.length - 1) * gap;
    let cursor = top + (plotHeight - usedHeight) / 2;
    stages[stage] = labels.map((label) => {
      const count = data.stage_counts[stage][label];
      const node = {
        stage,
        label,
        count,
        x: stageX[stageIndex],
        y: cursor,
        height: count * unit,
        sourceOffset: 0,
        targetOffset: 0,
      };
      cursor += node.height + gap;
      nodeMap.set(`${stage}:${label}`, node);
      return node;
    });
  });

  frictionSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  frictionSvg.replaceChildren();
  stageTitles.forEach((title, index) => {
    const label = svgElement("text", {
      class: "alluvial-stage-title",
      x: stageX[index] + nodeWidth / 2,
      y: 28,
      "text-anchor": "middle",
    });
    label.textContent = title;
    frictionSvg.append(label);
  });

  const episodeLookup = new Map(data.episodes.map((episode) => [episode.episode_id, episode]));
  const pairs = [["friction", "handling"], ["handling", "landing"]];
  pairs.forEach(([sourceStage, targetStage]) => {
    const links = data.links
      .filter((link) => link.source_stage === sourceStage && link.target_stage === targetStage)
      .sort((a, b) => {
        const sourceOrder = activeLabels[sourceStage].indexOf(a.source) - activeLabels[sourceStage].indexOf(b.source);
        return sourceOrder || activeLabels[targetStage].indexOf(a.target) - activeLabels[targetStage].indexOf(b.target);
      });
    const targetOffsets = new Map();
    links.forEach((link) => {
      const source = nodeMap.get(`${sourceStage}:${link.source}`);
      const target = nodeMap.get(`${targetStage}:${link.target}`);
      const ribbonWidth = link.count * unit;
      const sourceY = source.y + source.sourceOffset + ribbonWidth / 2;
      const targetOffset = targetOffsets.get(target.label) || 0;
      const targetY = target.y + targetOffset + ribbonWidth / 2;
      source.sourceOffset += ribbonWidth;
      targetOffsets.set(target.label, targetOffset + ribbonWidth);
      const x1 = source.x + nodeWidth;
      const x2 = target.x;
      const curve = Math.max(60, (x2 - x1) * 0.48);
      const path = svgElement("path", {
        class: "alluvial-link",
        d: `M ${x1} ${sourceY} C ${x1 + curve} ${sourceY}, ${x2 - curve} ${targetY}, ${x2} ${targetY}`,
        stroke: frictionColor("handling", sourceStage === "handling" ? source.label : (episodeLookup.get(link.episode_ids[0])?.handling || "")),
        "stroke-width": ribbonWidth,
      });
      const traceIds = link.trace_ids || [];
      const title = `${link.source} → ${link.target}`;
      const linkedEpisodes = link.episode_ids.map((id) => episodeLookup.get(id)).filter(Boolean);
      const detail = (sourceStage === "handling" || targetStage === "handling") ? pathwayBreakdown(linkedEpisodes) : "";
      path.addEventListener("pointerenter", (event) => showAlluvialTooltip(event, title, link.count, traceIds, detail));
      path.addEventListener("pointermove", (event) => showAlluvialTooltip(event, title, link.count, traceIds, detail));
      path.addEventListener("pointerleave", () => { alluvialTooltip.hidden = true; });
      const accessibleTitle = svgElement("title");
      accessibleTitle.textContent = `${title}: ${link.count} episodes`;
      path.append(accessibleTitle);
      frictionSvg.append(path);
    });
  });

  stageKeys.forEach((stage, stageIndex) => {
    stages[stage].forEach((node) => {
      const episodes = data.episodes.filter((episode) => episode[stage] === node.label);
      const color = frictionColor(stage, node.label, episodes);
      const group = svgElement("g", { class: "alluvial-node", tabindex: "0" });
      const rect = svgElement("rect", {
        x: node.x,
        y: node.y,
        width: nodeWidth,
        height: Math.max(3, node.height),
        fill: color,
      });
      const label = svgElement("text", {
        class: `alluvial-node-label stage-${stageIndex}`,
        x: stageIndex === 0 ? node.x - 9 : node.x + nodeWidth + 9,
        y: node.y + node.height / 2 + 3,
        "text-anchor": stageIndex === 0 ? "end" : "start",
      });
      label.textContent = `${node.label} (${node.count})`;
      const traceIds = [...new Set(episodes.map((episode) => episode.trace_id))];
      const detail = stage === "handling" ? pathwayBreakdown(episodes) : stageTitles[stageIndex];
      const show = (event) => showAlluvialTooltip(event, node.label, node.count, traceIds, detail);
      group.addEventListener("pointerenter", show);
      group.addEventListener("pointermove", show);
      group.addEventListener("pointerleave", () => { alluvialTooltip.hidden = true; });
      group.addEventListener("focus", () => {
        const bounds = rect.getBoundingClientRect();
        show({ clientX: bounds.left, clientY: bounds.top });
      });
      group.addEventListener("blur", () => { alluvialTooltip.hidden = true; });
      group.append(rect, label);
      frictionSvg.append(group);
    });
  });
}

function renderEvidenceLegend() {
  if (!state.evidence || !evidenceLegend) return;
  const models = orderedModels(state.evidence.traces);
  evidenceLegend.replaceChildren(...models.map((model) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "evidence-model-key";
    item.style.setProperty("--series-color", colorFor(model));
    item.setAttribute("aria-pressed", state.evidenceModel === model);
    item.dataset.muted = state.evidenceModel && state.evidenceModel !== model ? "true" : "false";
    item.title = state.evidenceModel === model ? "Show all models" : `Focus ${model}`;
    const count = state.evidence.traces.filter((trace) => trace.model === model).length;
    item.innerHTML = `<i></i><b>${model}</b><small>n=${count}</small>`;
    item.addEventListener("click", () => {
      state.evidenceModel = state.evidenceModel === model ? "" : model;
      renderEvidenceLegend();
      renderEvidencePlot();
    });
    return item;
  }));
  const marks = document.createElement("span");
  marks.className = "evidence-mark-key";
  marks.innerHTML = `<span><i class="mark-trace"></i>Trace</span><span><i class="mark-mean"></i>Model mean</span><span><i class="mark-region"></i>95% confidence region</span><em>Click a model to focus</em>`;
  evidenceLegend.append(marks);
}

function showEvidenceTooltip(event, trace) {
  const rounds = trace.evidence_rounds.length ? trace.evidence_rounds.join(", ") : "None";
  const score = Number.isFinite(trace.task_score) ? trace.task_score.toFixed(1) : "Unscored";
  const visibilityNote = trace.visibility_basis === "answer_only_convention"
    ? "<br><em>Answer-only trace: 100% visible by convention</em>"
    : "";
  evidenceTooltip.innerHTML = `<strong>Trace ${trace.trace_number} · ${escapeHtml(trace.app || "WebVA")} task ${trace.task_id}</strong>
    <p><b>${escapeHtml(trace.model)}</b> · ${escapeHtml(trace.task_type)}<br><code>${escapeHtml(trace.trace_id)}</code><br>
    Evidence: <b>${escapeHtml(trace.evidence_category)}</b><br>
    Evidence round: <b>${escapeHtml(rounds)}</b><br>
    On-screen share: <b>${trace.gui_percent.toFixed(1)}%</b><br>
    Off-screen share: <b>${trace.offscreen_percent.toFixed(1)}%</b><br>
    Task score: <b>${score}</b> · ${escapeHtml(trace.completion_status)}${visibilityNote}</p>`;
  evidenceTooltip.hidden = false;
  positionRelativeTooltip(event, evidenceTooltip);
}

function confidenceEllipse(records, xScale, yScale) {
  if (records.length < 2) return null;
  const points = records.map((trace) => [xScale(trace.gui_percent), yScale(trace.evidence_level)]);
  const centerX = mean(points.map(([x]) => x));
  const centerY = mean(points.map(([, y]) => y));
  const denominator = records.length - 1;
  const covarianceX = points.reduce((sum, [x]) => sum + (x - centerX) ** 2, 0) / denominator / records.length;
  const covarianceY = points.reduce((sum, [, y]) => sum + (y - centerY) ** 2, 0) / denominator / records.length;
  const covarianceXY = points.reduce((sum, [x, y]) => sum + (x - centerX) * (y - centerY), 0) / denominator / records.length;
  const root = Math.sqrt((covarianceX - covarianceY) ** 2 + 4 * covarianceXY ** 2);
  const eigenMajor = Math.max(0, (covarianceX + covarianceY + root) / 2);
  const eigenMinor = Math.max(0, (covarianceX + covarianceY - root) / 2);
  const confidenceScale = Math.sqrt(5.991);
  return {
    centerX,
    centerY,
    radiusX: Math.sqrt(eigenMajor) * confidenceScale,
    radiusY: Math.sqrt(eigenMinor) * confidenceScale,
    angle: Math.atan2(2 * covarianceXY, covarianceX - covarianceY) * 90 / Math.PI,
  };
}

function renderEvidencePlot() {
  if (!state.evidence || !evidenceSvg) return;
  const records = state.evidence.traces;
  const order = state.evidence.evidence_order;
  const width = Math.max(340, evidenceSvg.clientWidth || 1000);
  const height = evidenceSvg.clientHeight || 620;
  const mobile = width < 680;
  const margin = mobile
    ? { top: 35, right: 20, bottom: 82, left: 120 }
    : { top: 38, right: 48, bottom: 86, left: 220 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const x = (value) => margin.left + (value / 100) * plotWidth;
  const y = (level) => margin.top + plotHeight - (level / (order.length - 1)) * plotHeight;
  const mobileLabels = {
    "No delivered evidence": "No evidence",
    "Computed + visual evidence": "Computed + visual",
    "Grounded visual evidence": "Grounded visual",
    "Visual + prior knowledge": "Visual + prior",
    "Prior knowledge only": "Prior only",
  };
  evidenceSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  evidenceSvg.replaceChildren();

  const defs = svgElement("defs");
  const clip = svgElement("clipPath", { id: "evidence-plot-clip" });
  clip.append(svgElement("rect", { x: margin.left, y: margin.top, width: plotWidth, height: plotHeight }));
  defs.append(clip);
  evidenceSvg.append(defs);

  const bandStep = plotHeight / (order.length - 1);
  order.forEach((label, level) => {
    const center = y(level);
    const bandTop = Math.max(margin.top, center - bandStep / 2);
    const bandBottom = Math.min(margin.top + plotHeight, center + bandStep / 2);
    if (level % 2 === 1) {
      evidenceSvg.append(svgElement("rect", {
        class: "evidence-band",
        x: margin.left,
        y: bandTop,
        width: plotWidth,
        height: bandBottom - bandTop,
      }));
    }
    evidenceSvg.append(svgElement("line", {
      class: "grid-line",
      x1: margin.left,
      x2: margin.left + plotWidth,
      y1: center,
      y2: center,
    }));
    const tick = svgElement("text", {
      class: "evidence-tick-label",
      x: margin.left - 13,
      y: center + 4,
      "text-anchor": "end",
    });
    tick.textContent = mobile ? (mobileLabels[label] || label) : label;
    evidenceSvg.append(tick);
  });

  [0, 25, 50, 75, 100].forEach((tick) => {
    const tickX = x(tick);
    evidenceSvg.append(svgElement("line", {
      class: tick === 50 ? "evidence-midline" : "evidence-vertical-grid",
      x1: tickX,
      x2: tickX,
      y1: margin.top,
      y2: margin.top + plotHeight,
    }));
    const label = svgElement("text", {
      class: "tick-label",
      x: tickX,
      y: margin.top + plotHeight + 25,
      "text-anchor": "middle",
    });
    label.textContent = `${tick}%`;
    evidenceSvg.append(label);
  });
  evidenceSvg.append(svgElement("line", { class: "axis-line", x1: margin.left, x2: margin.left + plotWidth, y1: margin.top + plotHeight, y2: margin.top + plotHeight }));
  evidenceSvg.append(svgElement("line", { class: "axis-line", x1: margin.left, x2: margin.left, y1: margin.top, y2: margin.top + plotHeight }));

  const direction = svgElement("text", { class: "evidence-direction", x: margin.left, y: margin.top - 15 });
  direction.textContent = "↑ More faithful evidence";
  evidenceSvg.append(direction);
  const xLabel = svgElement("text", { class: "axis-label", x: margin.left + plotWidth / 2, y: height - 21, "text-anchor": "middle" });
  xLabel.textContent = mobile ? "Share of working rounds on screen" : "Action visibility · share of working rounds on screen";
  evidenceSvg.append(xLabel);
  const offscreenHint = svgElement("text", { class: "axis-hint", x: margin.left, y: height - 48, "text-anchor": "start" });
  offscreenHint.textContent = "All work off screen";
  evidenceSvg.append(offscreenHint);
  const onscreenHint = svgElement("text", { class: "axis-hint", x: margin.left + plotWidth, y: height - 48, "text-anchor": "end" });
  onscreenHint.textContent = "All work on screen";
  evidenceSvg.append(onscreenHint);

  const plotted = svgElement("g", { "clip-path": "url(#evidence-plot-clip)" });
  const models = orderedModels(records);
  const densityNeighbors = new Map(records.map((trace) => [
    trace.trace_id,
    records
      .filter((candidate) => candidate.evidence_level === trace.evidence_level && Math.abs(candidate.gui_percent - trace.gui_percent) <= 4)
      .sort((a, b) => stableHash(a.trace_id) - stableHash(b.trace_id)),
  ]));
  const drawOrder = state.evidenceModel
    ? [...models.filter((model) => model !== state.evidenceModel), state.evidenceModel]
    : models;
  drawOrder.forEach((model) => {
    const modelRecords = records.filter((trace) => trace.model === model);
    const region = confidenceEllipse(modelRecords, x, y);
    if (!region) return;
    plotted.append(svgElement("ellipse", {
      class: `evidence-confidence${state.evidenceModel === model ? " is-focused" : ""}${state.evidenceModel && state.evidenceModel !== model ? " is-muted" : ""}`,
      cx: region.centerX,
      cy: region.centerY,
      rx: region.radiusX,
      ry: region.radiusY,
      fill: colorFor(model),
      stroke: colorFor(model),
      transform: `rotate(${region.angle} ${region.centerX} ${region.centerY})`,
    }));
  });

  records.forEach((trace) => {
    const hash = stableHash(trace.trace_id);
    const xUnit = ((hash % 1001) / 1000) - 0.5;
    const ySeed = (Math.floor(hash / 1001) % 1001) / 1000;
    const neighbors = densityNeighbors.get(trace.trace_id) || [trace];
    const density = neighbors.length;
    const densityBoost = clamp((density - 3) / 15, 0, 1);
    const xSpread = (mobile ? 34 : 64) + densityBoost * (mobile ? 42 : 100);
    const rank = neighbors.length > 1 ? neighbors.findIndex((candidate) => candidate.trace_id === trace.trace_id) / (neighbors.length - 1) : xUnit + 0.5;
    let jitterX = (rank - 0.5) * xSpread;
    if (trace.gui_percent <= 1) jitterX = rank * xSpread;
    if (trace.gui_percent >= 99) jitterX = -rank * xSpread;
    const ySpread = bandStep * 0.96;
    let jitterY = (ySeed - 0.5) * ySpread;
    if (trace.evidence_level === 0) jitterY = -ySeed * ySpread * 0.5;
    if (trace.evidence_level === order.length - 1) jitterY = ySeed * ySpread * 0.5;
    const muted = state.evidenceModel && state.evidenceModel !== trace.model;
    const focused = state.evidenceModel === trace.model;
    const pointX = clamp(x(trace.gui_percent) + jitterX, margin.left + 5, margin.left + plotWidth - 5);
    const pointY = clamp(y(trace.evidence_level) + jitterY, margin.top + 5, margin.top + plotHeight - 5);
    const point = svgElement("circle", {
      class: `evidence-trace-point${focused ? " is-focused" : ""}${muted ? " is-muted" : ""}`,
      cx: pointX,
      cy: pointY,
      r: mobile ? 3.8 : 4.8,
      fill: colorFor(trace.model),
      tabindex: 0,
      role: "link",
      "aria-label": `Trace ${trace.trace_number}, ${trace.model}, ${trace.evidence_category}, ${trace.gui_percent}% on screen`,
    });
    point.addEventListener("pointerenter", (event) => showEvidenceTooltip(event, trace));
    point.addEventListener("pointermove", (event) => showEvidenceTooltip(event, trace));
    point.addEventListener("pointerleave", () => { evidenceTooltip.hidden = true; });
    point.addEventListener("focus", (event) => showEvidenceTooltip(event, trace));
    point.addEventListener("blur", () => { evidenceTooltip.hidden = true; });
    point.addEventListener("click", () => { window.location.href = `../#trace=${encodeURIComponent(trace.trace_id)}`; });
    point.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        window.location.href = `../#trace=${encodeURIComponent(trace.trace_id)}`;
      }
    });
    plotted.append(point);
  });

  drawOrder.forEach((model) => {
    const modelRecords = records.filter((trace) => trace.model === model);
    const averageVisibility = mean(modelRecords.map((trace) => trace.gui_percent));
    const averageEvidence = mean(modelRecords.map((trace) => trace.evidence_level));
    const point = svgElement("circle", {
      class: `evidence-model-mean${state.evidenceModel === model ? " is-focused" : ""}${state.evidenceModel && state.evidenceModel !== model ? " is-muted" : ""}`,
      cx: x(averageVisibility),
      cy: y(averageEvidence),
      r: state.evidenceModel === model ? (mobile ? 8 : 11) : (mobile ? 7 : 9),
      fill: colorFor(model),
      tabindex: 0,
      role: "button",
      "aria-pressed": state.evidenceModel === model,
      "aria-label": `${model} mean, ${averageVisibility.toFixed(1)}% on screen`,
    });
    const showMean = (event) => {
      const nearest = order[Math.round(averageEvidence)];
      evidenceTooltip.innerHTML = `<strong>${model} · model mean</strong><p>${modelRecords.length} traces<br>On-screen share: <b>${averageVisibility.toFixed(1)}%</b><br>Mean evidence level: <b>${averageEvidence.toFixed(1)} of ${order.length - 1}</b><br>Nearest category: <b>${nearest}</b></p>`;
      evidenceTooltip.hidden = false;
      positionRelativeTooltip(event, evidenceTooltip);
    };
    point.addEventListener("pointerenter", showMean);
    point.addEventListener("pointermove", showMean);
    point.addEventListener("pointerleave", () => { evidenceTooltip.hidden = true; });
    point.addEventListener("focus", showMean);
    point.addEventListener("blur", () => { evidenceTooltip.hidden = true; });
    point.addEventListener("click", () => {
      state.evidenceModel = state.evidenceModel === model ? "" : model;
      evidenceTooltip.hidden = true;
      renderEvidenceLegend();
      renderEvidencePlot();
    });
    point.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        point.dispatchEvent(new MouseEvent("click"));
      }
    });
    plotted.append(point);
  });
  evidenceSvg.append(plotted);
}

async function init() {
  try {
    const [response, frictionResponse, evidenceResponse] = await Promise.all([
      fetch("data.json?v=4"),
      fetch("friction_flow.json?v=5"),
      fetch("evidence_visibility.json?v=2"),
    ]);
    if (!response.ok) throw new Error(`Analysis data request failed (${response.status})`);
    if (!frictionResponse.ok) throw new Error(`Friction data request failed (${frictionResponse.status})`);
    if (!evidenceResponse.ok) throw new Error(`Evidence data request failed (${evidenceResponse.status})`);
    const [data, frictionData, evidenceData] = await Promise.all([response.json(), frictionResponse.json(), evidenceResponse.json()]);
    state.traces = data.traces || [];
    state.friction = frictionData;
    state.evidence = evidenceData;
    state.activeModels = new Set(state.traces.map((trace) => trace.model));
    const taskTypes = [...new Set(state.traces.map((trace) => trace.task_type).filter(Boolean))].sort();
    taskTypes.forEach((type) => taskFilter.add(new Option(type, type)));
    document.querySelector("#total-traces").textContent = state.traces.length;
    document.querySelector("#total-models").textContent = state.activeModels.size;
    document.querySelector("#tasks-per-model").textContent = state.traces.length / state.activeModels.size;
    renderLegend();
    renderPerformanceSummary();
    renderWorkShareChart();
    renderBehavioralSignatures();
    renderFrictionSummary();
    renderFrictionAlluvial();
    renderEvidenceLegend();
    renderEvidencePlot();
    renderChart();
    taskFilter.addEventListener("change", () => {
      state.taskType = taskFilter.value;
      renderChart();
    });
    new ResizeObserver(renderChart).observe(svg);
    new ResizeObserver(renderEvidencePlot).observe(evidenceSvg);
  } catch (error) {
    document.querySelector(".analysis-card").innerHTML = `<div class="analysis-error"><strong>Could not load analysis data.</strong><p>${error.message}</p></div>`;
  }
}

init();
