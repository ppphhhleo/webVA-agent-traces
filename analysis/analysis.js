const MODEL_COLORS = {
  "GPT-5.5": "#7655a6",
  "GPT-5.4": "#2d72ad",
  "Claude Opus 4.8": "#c55d3d",
  "Claude Sonnet 5": "#278061",
};
const MODEL_ORDER = ["GPT-5.4", "GPT-5.5", "Claude Opus 4.8", "Claude Sonnet 5"];

const state = { traces: [], activeModels: new Set(), taskType: "" };
const svg = document.querySelector("#scatterplot");
const tooltip = document.querySelector("#plot-tooltip");
const legend = document.querySelector("#model-legend");
const taskFilter = document.querySelector("#task-type-filter");
const summaryBody = document.querySelector("#model-summary");

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

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
      renderSummary();
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

function renderSummary() {
  const traces = visibleTraces();
  const models = orderedModels(state.traces).filter((model) => state.activeModels.has(model));
  summaryBody.replaceChildren(...models.map((model) => {
    const rows = traces.filter((trace) => trace.model === model);
    const firstPositions = rows.map((trace) => trace.first_offscreen_position_percent).filter((value) => value !== null);
    const row = document.createElement("tr");
    row.innerHTML = `<td><span class="model-key" style="--series-color:${colorFor(model)}"><i></i>${model}</span></td>
      <td class="metric-value">${rows.length}</td>
      <td class="metric-value">${percent(median(rows.map((trace) => trace.offscreen_percent)))}</td>
      <td class="metric-value">${percent(median(firstPositions))}</td>
      <td class="metric-value">${rows.filter((trace) => trace.first_offscreen_round === null).length}</td>`;
    return row;
  }));
}

async function init() {
  try {
    const response = await fetch("data.json");
    if (!response.ok) throw new Error(`Analysis data request failed (${response.status})`);
    const data = await response.json();
    state.traces = data.traces || [];
    state.activeModels = new Set(state.traces.map((trace) => trace.model));
    const taskTypes = [...new Set(state.traces.map((trace) => trace.task_type).filter(Boolean))].sort();
    taskTypes.forEach((type) => taskFilter.add(new Option(type, type)));
    document.querySelector("#total-traces").textContent = state.traces.length;
    document.querySelector("#total-models").textContent = state.activeModels.size;
    document.querySelector("#never-count").textContent = state.traces.filter((trace) => trace.first_offscreen_round === null).length;
    renderLegend();
    renderSummary();
    renderChart();
    taskFilter.addEventListener("change", () => {
      state.taskType = taskFilter.value;
      renderChart();
      renderSummary();
    });
    new ResizeObserver(renderChart).observe(svg);
  } catch (error) {
    document.querySelector(".analysis-card").innerHTML = `<div class="analysis-error"><strong>Could not load analysis data.</strong><p>${error.message}</p></div>`;
  }
}

init();
