const MODEL_COLORS = {
  "GPT-5.5": "#7655a6",
  "GPT-5.4": "#2d72ad",
  "Claude Opus 4.8": "#c55d3d",
  "Claude Sonnet 5": "#278061",
};
const MODEL_ORDER = ["GPT-5.4", "GPT-5.5", "Claude Opus 4.8", "Claude Sonnet 5"];
const TASK_TYPE_ORDER = ["Low-level", "Compound", "High-level"];
const FRICTION_COLORS = {
  "Misgrounded manipulation": "#d7621b",
  "Repetition loop": "#3f8db8",
};
const RESPONSE_COLORS = {
  "Retry / recover in GUI": "#2f7d50",
  "Moved off screen": "#62419a",
  "Continued without repair": "#b44b43",
  "Stopped without resolution": "#68706d",
};
const LANDING_COLORS = {
  "Grounded visual evidence": "#2f7d50",
  "Combined visual + computed": "#277f85",
  "Computed evidence": "#62419a",
  "Prior-knowledge answer": "#9a79ae",
  "Misgrounded evidence": "#c76322",
  "Fabricated evidence": "#ad2630",
  "No answer": "#68706d",
};
const PATHWAY_COLORS = {
  "GUI recovery": "#2f7d50",
  "Failed code attempt → GUI recovery": "#4d8a55",
  "GUI retry → code verification": "#277f85",
  "Off-screen work → GUI verification": "#277f85",
  "GUI ↔ code attempts → code resolution": "#62419a",
  "Code resolution after GUI friction": "#62419a",
  "GUI repetition + failed code → fabrication": "#9d3a40",
  "Off-screen attempt, unresolved": "#8b668b",
  "Continued without repair": "#b44b43",
  "Stopped without resolution": "#68706d",
};

const state = { traces: [], friction: null, activeModels: new Set(), taskType: "" };
const svg = document.querySelector("#scatterplot");
const tooltip = document.querySelector("#plot-tooltip");
const legend = document.querySelector("#model-legend");
const taskFilter = document.querySelector("#task-type-filter");
const performanceBody = document.querySelector("#performance-summary");
const workShareChart = document.querySelector("#work-share-chart");
const switchDelayChart = document.querySelector("#switch-delay-chart");
const frictionSvg = document.querySelector("#friction-alluvial");
const alluvialTooltip = document.querySelector("#alluvial-tooltip");

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
  return `<strong>Trace ${trace.trace_number} · Task ${trace.task_id}</strong>
    <p><b>${trace.model}</b><br>${trace.task_type}<br>
    Off-screen share: <b>${percent(trace.offscreen_percent)}</b><br>
    GUI share: <b>${percent(trace.gui_percent)}</b><br>
    First off-screen: <b>${first}</b><br>
    ${trace.offscreen_rounds} off-screen · ${trace.gui_rounds} GUI · ${trace.neutral_rounds} neutral</p>`;
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
      const row = document.createElement("div");
      row.className = "share-row";
      row.innerHTML = `<div class="share-label"><span class="model-key" style="--series-color:${colorFor(model)}"><i></i>${model}</span><small>n=${traces.length}</small></div>
        <div class="share-track" aria-label="${model}, ${taskType}: ${onscreen.toFixed(1)}% on screen and ${offscreen.toFixed(1)}% off screen">
          <div class="share-segment share-on" style="width:${onscreen}%">${onscreen >= 14 ? `${onscreen.toFixed(1)}%` : ""}</div>
          <div class="share-segment share-off" style="width:${offscreen}%">${offscreen >= 14 ? `${offscreen.toFixed(1)}%` : ""}</div>
        </div>`;
      return row;
    }));
    group.append(title, rows);
    return group;
  }));
}

function renderSwitchDelayChart() {
  const models = orderedModels(state.traces);
  const taskTypes = ["Overall", ...[...new Set(state.traces.map((trace) => trace.task_type).filter(Boolean))]
    .sort((a, b) => TASK_TYPE_ORDER.indexOf(a) - TASK_TYPE_ORDER.indexOf(b))];

  switchDelayChart.replaceChildren(...taskTypes.map((taskType) => {
    const group = document.createElement("section");
    group.className = "delay-group";
    const title = document.createElement("h4");
    title.textContent = taskType;
    const rows = document.createElement("div");
    rows.className = "delay-rows";
    rows.replaceChildren(...models.map((model) => {
      const traces = state.traces.filter((trace) =>
        trace.model === model && (taskType === "Overall" || trace.task_type === taskType)
      );
      const positions = traces.map((trace) =>
        Number.isFinite(trace.first_offscreen_position_percent)
          ? trace.first_offscreen_position_percent
          : 100
      );
      const switchLatency = mean(positions) || 0;
      const never = traces.filter((trace) => trace.first_offscreen_round === null).length;
      const edgeClass = switchLatency >= 88 ? " edge-right" : switchLatency <= 12 ? " edge-left" : "";
      const row = document.createElement("div");
      row.className = "delay-row";
      row.innerHTML = `<div class="delay-label"><span class="model-key" style="--series-color:${colorFor(model)}"><i></i>${model}</span><small>never ${never}/${traces.length}</small></div>
        <div class="delay-track" aria-label="${model}, ${taskType}: mean off-screen switch latency ${switchLatency.toFixed(1)}%; lower is faster; ${never} of ${traces.length} traces never went off screen">
          <span class="delay-fill" style="width:${switchLatency}%;--series-color:${colorFor(model)}"></span>
          <i class="delay-dot" style="left:${switchLatency}%;--series-color:${colorFor(model)}"></i>
          <b class="delay-value${edgeClass}" style="left:${switchLatency}%">${switchLatency.toFixed(1)}%</b>
        </div>`;
      return row;
    }));
    const axis = document.createElement("div");
    axis.className = "delay-axis";
    axis.innerHTML = "<span>0%</span><span>50%</span><span>100%</span>";
    group.append(title, rows, axis);
    return group;
  }));
}

function frictionColor(stage, label, episodes = []) {
  if (stage === "friction") return FRICTION_COLORS[label] || "#687777";
  if (stage === "response") return RESPONSE_COLORS[label] || "#687777";
  if (stage === "pathway") return PATHWAY_COLORS[label] || "#687777";
  if (stage === "landing") return LANDING_COLORS[label] || "#687777";
  const response = episodes.find((episode) => episode.pathway === label)?.response;
  return RESPONSE_COLORS[response] || "#687777";
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
  const stopped = data.counts.stopped_without_resolution;
  const unresolved = continued + stopped;
  document.querySelector("#friction-episodes").textContent = total;
  document.querySelector("#friction-offscreen").textContent = `${offscreen} · ${(offscreen / total * 100).toFixed(0)}%`;
  document.querySelector("#friction-unseen").textContent = `${unresolved} · ${(unresolved / total * 100).toFixed(0)}%`;
  document.querySelector("#friction-callout").innerHTML = `<strong>One friction episode can cross channels more than once.</strong>
    Of ${total} coded episodes, ${offscreen} use off-screen work somewhere in the handling path; ${continued} continue under an unrepaired interface state, while ${stopped} stop without resolving it.`;

  const examples = document.querySelector("#friction-examples");
  examples.replaceChildren(...(data.case_studies || []).map((example) => {
    const link = document.createElement("a");
    link.href = `../#trace=${encodeURIComponent(example.trace_id)}`;
    const episode = data.episodes.find((item) => item.trace_id === example.trace_id);
    link.style.setProperty("--path-color", PATHWAY_COLORS[episode?.pathway] || "#68706d");
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
  const height = 600;
  const top = 62;
  const bottom = 26;
  const plotHeight = height - top - bottom;
  const nodeWidth = 12;
  const stageKeys = ["friction", "response", "pathway", "landing"];
  const stageTitles = ["GUI friction", "First response", "Resolution pathway", "Evidence landing"];
  const stageX = [164, 430, 742, 1050];
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
  const pairs = [["friction", "response"], ["response", "pathway"], ["pathway", "landing"]];
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
        stroke: frictionColor("response", sourceStage === "response" ? source.label : (episodeLookup.get(link.episode_ids[0])?.response || "")),
        "stroke-width": ribbonWidth,
      });
      const traceIds = link.trace_ids || [];
      const title = `${link.source} → ${link.target}`;
      path.addEventListener("pointerenter", (event) => showAlluvialTooltip(event, title, link.count, traceIds));
      path.addEventListener("pointermove", (event) => showAlluvialTooltip(event, title, link.count, traceIds));
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
      const show = (event) => showAlluvialTooltip(event, node.label, node.count, traceIds, stageTitles[stageIndex]);
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

async function init() {
  try {
    const [response, frictionResponse] = await Promise.all([
      fetch("data.json?v=3"),
      fetch("friction_flow.json?v=2"),
    ]);
    if (!response.ok) throw new Error(`Analysis data request failed (${response.status})`);
    if (!frictionResponse.ok) throw new Error(`Friction data request failed (${frictionResponse.status})`);
    const [data, frictionData] = await Promise.all([response.json(), frictionResponse.json()]);
    state.traces = data.traces || [];
    state.friction = frictionData;
    state.activeModels = new Set(state.traces.map((trace) => trace.model));
    const taskTypes = [...new Set(state.traces.map((trace) => trace.task_type).filter(Boolean))].sort();
    taskTypes.forEach((type) => taskFilter.add(new Option(type, type)));
    document.querySelector("#total-traces").textContent = state.traces.length;
    document.querySelector("#total-models").textContent = state.activeModels.size;
    document.querySelector("#tasks-per-model").textContent = state.traces.length / state.activeModels.size;
    renderLegend();
    renderPerformanceSummary();
    renderWorkShareChart();
    renderSwitchDelayChart();
    renderFrictionSummary();
    renderFrictionAlluvial();
    renderChart();
    taskFilter.addEventListener("change", () => {
      state.taskType = taskFilter.value;
      renderChart();
    });
    new ResizeObserver(renderChart).observe(svg);
  } catch (error) {
    document.querySelector(".analysis-card").innerHTML = `<div class="analysis-error"><strong>Could not load analysis data.</strong><p>${error.message}</p></div>`;
  }
}

init();
