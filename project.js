const traceMatch = window.location.hash.match(/^#trace=(.+)$/);
if (traceMatch) {
  window.location.replace(`traces/${window.location.hash}`);
}

const styles = `
  :root {
    --ink: #17272a;
    --muted: #667477;
    --line: #d8d1c3;
    --paper: #f7f3e9;
    --paper-soft: #fbf8f1;
    --panel: #fffdf8;
    --teal: #087b78;
    --teal-dark: #075f5d;
    --blue: #2a79ad;
    --amber: #d99a16;
    --purple: #7555a7;
    --rose: #c96f98;
    --orange: #c35b39;
    --serif: Georgia, Cambria, "Times New Roman", serif;
    --sans: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  }

  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { margin: 0; color: var(--ink); background: var(--paper-soft); font-family: var(--sans); font-size: 16px; line-height: 1.62; }
  img { display: block; max-width: 100%; }
  a { color: inherit; }
  button { font: inherit; }
  .skip-link { position: fixed; left: 12px; top: -80px; z-index: 100; padding: 8px 12px; background: #fff; border: 1px solid var(--ink); }
  .skip-link:focus { top: 12px; }

  .site-nav {
    position: sticky; top: 0; z-index: 20; display: flex; align-items: center; justify-content: space-between;
    min-height: 58px; padding: 0 max(24px, calc((100vw - 1080px) / 2)); background: rgba(255,253,248,.97);
    border-bottom: 1px solid var(--line); backdrop-filter: blur(10px);
  }
  .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; font-weight: 750; letter-spacing: -.02em; }
  .brand-mark { position: relative; width: 26px; height: 26px; border: 1.5px solid var(--teal); border-radius: 50%; }
  .brand-mark i { position: absolute; width: 4px; height: 4px; border-radius: 50%; background: var(--teal); }
  .brand-mark i:nth-child(1) { left: 6px; top: 8px; }
  .brand-mark i:nth-child(2) { right: 6px; top: 6px; }
  .brand-mark i:nth-child(3) { left: 11px; bottom: 5px; }

  .wrap { width: min(1040px, calc(100% - 40px)); margin: 0 auto; }
  .hero-shell { background: var(--paper); border-bottom: 1px solid var(--line); }
  .hero { max-width: 1220px; margin: 0 auto; padding: 62px 20px 52px; text-align: center; }
  .eyebrow { margin: 0 0 10px; color: var(--teal-dark); font-size: 12px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
  h1, h2, h3 { font-family: var(--serif); }
  h1 { max-width: none; margin: 0 auto; font-size: clamp(34px, 4.2vw, 48px); line-height: 1.12; letter-spacing: -.025em; }
  .subtitle { margin: 10px 0 0; color: #415154; font-size: clamp(18px, 2vw, 23px); }
  .abstract { max-width: 790px; margin: 24px auto 0; color: #394b4e; font-size: 17px; line-height: 1.72; }
  .study-counts { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 26px; margin: 28px 0 0; padding: 18px 0 0; border-top: 1px solid #cfe0e3; }
  .study-counts div { min-width: 110px; }
  .study-counts b { display: block; color: var(--ink); font-family: var(--mono); font-size: 21px; }
  .study-counts span { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }

  main section { scroll-margin-top: 78px; }
  .section { padding: 70px 0; border-bottom: 1px solid var(--line); }
  .section.compact { padding-top: 54px; padding-bottom: 54px; }
  .section-head { max-width: 760px; margin-bottom: 28px; }
  .section-head.centered { margin-right: auto; margin-left: auto; text-align: center; }
  .teaser .section-head { max-width: 1000px; }
  .section-head h2 { margin: 0; font-size: clamp(28px, 3.2vw, 38px); line-height: 1.16; letter-spacing: -.018em; }
  .section-head p:last-child { margin: 13px 0 0; color: var(--muted); font-size: 17px; }

  .figure { margin: 0; background: var(--panel); border: 1px solid var(--line); }
  .figure-button { width: 100%; padding: 0; cursor: zoom-in; background: var(--panel); border: 0; }
  .figure img { width: 100%; height: auto; object-fit: contain; background: var(--panel); }
  .figure figcaption { display: flex; gap: 12px; padding: 12px 15px; color: var(--muted); background: var(--panel); border-top: 1px solid var(--line); font-size: 13px; }
  .figure figcaption b { color: var(--ink); }
  .teaser .figure { box-shadow: 0 8px 24px rgba(25, 54, 58, .07); }

  .intro-grid { display: grid; grid-template-columns: .8fr 1.2fr; gap: 44px; align-items: start; }
  .intro-copy h2 { margin: 0; font-size: 34px; line-height: 1.17; }
  .intro-copy > p { color: #435356; }
  .plain-list { padding: 0; margin: 24px 0; list-style: none; border-top: 1px solid var(--line); }
  .plain-list li { padding: 10px 0; border-bottom: 1px solid var(--line); color: #425255; }
  .plain-list strong { color: var(--ink); }
  .text-link { color: var(--teal-dark); font-weight: 700; text-decoration-thickness: 1px; text-underline-offset: 3px; }

  .findings-title { padding-bottom: 26px; }
  .finding { padding: 64px 0; border-top: 1px solid var(--line); }
  .finding-head { display: grid; grid-template-columns: 52px minmax(0, 760px); gap: 18px; align-items: start; margin-bottom: 26px; }
  .finding-number { padding-top: 5px; color: var(--teal-dark); font-family: var(--mono); font-size: 15px; }
  .finding-head h3 { margin: 0; font-size: clamp(26px, 3vw, 36px); line-height: 1.18; }
  .finding-copy { max-width: 850px; margin-left: 70px; color: #405154; font-size: 17px; }
  .finding-copy p { margin: 0; }
  .stat-row { display: grid; grid-template-columns: repeat(4, 1fr); margin: 28px 0; border: 1px solid var(--line); background: var(--panel); }
  .stat-row div { padding: 15px; border-right: 1px solid var(--line); }
  .stat-row div:last-child { border-right: 0; }
  .stat-row span, .stat-row small { display: block; }
  .stat-row span { color: var(--muted); font-size: 12px; font-weight: 700; text-transform: uppercase; }
  .stat-row b { color: var(--teal-dark); font-family: var(--mono); font-size: 21px; }
  .stat-row small { color: var(--muted); font-size: 12px; }
  .figure-pair { display: grid; grid-template-columns: 1.15fr .85fr; gap: 18px; margin-top: 28px; }
  .examples { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 18px; }
  .examples.two { grid-template-columns: repeat(2, 1fr); }
  .example { display: block; min-height: 126px; padding: 15px; background: var(--panel); border: 1px solid var(--line); text-decoration: none; }
  .example:hover, .example:focus-visible { border-color: #6da7a4; outline: 2px solid #d6ecea; }
  .example span, .example small { display: block; }
  .example span { margin-bottom: 7px; color: var(--teal-dark); font-size: 12px; font-weight: 800; text-transform: uppercase; }
  .example strong { font-size: 14px; line-height: 1.45; }
  .example small { margin-top: 10px; color: var(--muted); }
  .metric-row { display: flex; gap: 12px; margin-top: 22px; }
  .metric-row div { flex: 1; padding: 13px; background: var(--paper); border-left: 3px solid #87b7c4; }
  .metric-row b { display: block; font-family: var(--mono); font-size: 20px; }
  .metric-row span { color: var(--muted); font-size: 12px; }
  .profile-grid { display: grid; grid-template-columns: repeat(4, 1fr); margin-top: 18px; border: 1px solid var(--line); }
  .profile-grid div { padding: 14px; border-right: 1px solid var(--line); }
  .profile-grid div:last-child { border-right: 0; }
  .profile-grid b, .profile-grid span { display: block; }
  .profile-grid b { font-size: 14px; }
  .profile-grid span { margin-top: 4px; color: var(--muted); font-size: 12px; }

  .design { background: var(--paper); }
  .principles { display: grid; grid-template-columns: repeat(2, 1fr); border: 1px solid var(--line); background: var(--panel); }
  .principles article { padding: 22px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .principles article:nth-child(even) { border-right: 0; }
  .principles article:nth-last-child(-n+2) { border-bottom: 0; }
  .principles span { color: var(--teal-dark); font-family: var(--mono); font-size: 12px; }
  .principles h3 { margin: 4px 0 6px; font-size: 21px; }
  .principles p { margin: 0; color: var(--muted); font-size: 14px; }

  .resource-grid { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid var(--line); }
  .resource-grid a { min-height: 205px; padding: 20px; background: var(--panel); border-right: 1px solid var(--line); text-decoration: none; }
  .resource-grid a:last-child { border-right: 0; }
  .resource-grid a:hover, .resource-grid a:focus-visible { background: var(--paper); }
  .resource-grid span { color: var(--teal-dark); font-family: var(--mono); font-size: 12px; }
  .resource-grid h3 { margin: 8px 0; font-size: 20px; }
  .resource-grid p { color: var(--muted); font-size: 13px; }
  .resource-grid b { color: var(--teal-dark); font-size: 13px; }

  footer { display: flex; justify-content: space-between; gap: 28px; padding: 30px max(24px, calc((100vw - 1040px) / 2)); color: var(--muted); background: var(--panel); border-top: 1px solid var(--line); font-size: 13px; }
  footer strong { color: var(--ink); }
  footer nav { display: flex; gap: 16px; }

  dialog { width: min(94vw, 1500px); max-height: 94vh; padding: 42px 16px 16px; border: 1px solid #829496; background: #fff; }
  dialog::backdrop { background: rgba(15, 35, 38, .78); }
  dialog img { width: 100%; max-height: 82vh; object-fit: contain; background: #fff; }
  dialog button { position: absolute; right: 12px; top: 10px; padding: 5px 9px; background: #fff; border: 1px solid var(--line); cursor: pointer; }

  @media (max-width: 820px) {
    .site-nav { padding: 0 20px; }
    .hero { padding-top: 48px; }
    .intro-grid, .figure-pair { grid-template-columns: 1fr; }
    .examples, .examples.two { grid-template-columns: 1fr; }
    .stat-row { grid-template-columns: repeat(2, 1fr); }
    .stat-row div:nth-child(2) { border-right: 0; }
    .stat-row div:nth-child(-n+2) { border-bottom: 1px solid var(--line); }
    .profile-grid { grid-template-columns: repeat(2, 1fr); }
    .profile-grid div:nth-child(2) { border-right: 0; }
    .profile-grid div:nth-child(-n+2) { border-bottom: 1px solid var(--line); }
    .resource-grid { grid-template-columns: repeat(2, 1fr); }
    .resource-grid a:nth-child(2) { border-right: 0; }
    .resource-grid a:nth-child(-n+2) { border-bottom: 1px solid var(--line); }
  }

  @media (min-width: 900px) {
    .hero h1, .teaser .section-head h2 { white-space: nowrap; }
  }

  @media (max-width: 560px) {
    .wrap { width: min(100% - 28px, 1040px); }
    h1 { font-size: 34px; }
    .hero { padding: 42px 16px 38px; }
    .section { padding: 50px 0; }
    .finding { padding: 48px 0; }
    .finding-head { grid-template-columns: 36px 1fr; gap: 10px; }
    .finding-copy { margin-left: 46px; font-size: 16px; }
    .stat-row, .profile-grid, .principles, .resource-grid { grid-template-columns: 1fr; }
    .stat-row div, .profile-grid div, .principles article, .resource-grid a { border-right: 0; border-bottom: 1px solid var(--line); }
    .stat-row div:last-child, .profile-grid div:last-child, .principles article:last-child, .resource-grid a:last-child { border-bottom: 0; }
    .metric-row { flex-direction: column; }
    footer { flex-direction: column; }
  }

  @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
`;

const markup = `
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-nav">
    <a class="brand" href="#top" aria-label="Project home"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>TraLens</span></a>
  </header>

  <main id="main">
    <div class="hero-shell" id="top">
      <section class="hero">
        <p class="eyebrow">Agentic visual analytics</p>
        <h1>Do AI Agents Really Conduct Visual Analytics?</h1>
        <p class="subtitle">Tracing hidden trajectories behind successful answers</p>
        <p class="abstract">Correct answers can conceal analyses that barely engage with the visualization. We compare complete agent and human trajectories to study how answers are produced, where interaction breaks down, and what evidence remains inspectable.</p>
        <div class="study-counts" aria-label="Study summary"><div><b>360</b><span>trajectories</span></div><div><b>30</b><span>VA tasks</span></div><div><b>8</b><span>interfaces</span></div><div><b>4 + 4</b><span>models + people</span></div></div>
      </section>
    </div>

    <section class="section teaser" aria-labelledby="teaser-title">
      <div class="wrap">
        <header class="section-head centered"><p class="eyebrow">The central problem</p><h2 id="teaser-title">Same question, different analytical paths</h2><p>A human works through the visible interface. Agents mix GUI actions with code, bypass the interface, or substitute prior knowledge. The conclusions may all sound plausible, while their evidence differs sharply.</p></header>
        ${pdfPreview("assets/project/agent-traces-teaser-l.png", "assets/project/agent-traces-teaser-l.pdf", "Different analytical paths through the same wine visualization task.", "Teaser", "Same task and interface, but unequal paths and evidence.")}
      </div>
    </section>

    <section class="section compact" id="study">
      <div class="wrap intro-grid">
        <div class="intro-copy"><p class="eyebrow">Study design</p><h2>We compare the process, not only the answer.</h2><p>Agents and people completed the same 30 tasks in the same controlled desktop. TraLens records screenshots, actions, reasoning, tool outputs, and submitted answers as replayable trajectories.</p><ul class="plain-list"><li><strong>WebVA agents:</strong> 4 models × 30 tasks</li><li><strong>Human analysts:</strong> 4 participants × 30 tasks</li><li><strong>General web:</strong> 4 models × 30 matched GAIA tasks</li></ul><a class="text-link" href="traces/">Browse the 120 WebVA agent traces →</a></div>
        ${figure("assets/project/study-setup.png", "Study design comparing agent, human, and general-web trajectories.", "Study", "A matched trajectory corpus across visual-analytics and general-web tasks.")}
      </div>
    </section>

    <section class="section" id="findings">
      <div class="wrap">
        <header class="section-head findings-title"><p class="eyebrow">Findings</p><h2>Similar outcomes, different analytical trajectories</h2><p>The results follow the paper's three questions: how agents conduct visual analytics, what changes beyond visual analytics, and how agent practices differ from human analysis.</p></header>

        <article class="finding">
          ${findingHead("01", "RQ1 · Analytical routes", "High task scores masked different ways of working")}
          <div class="finding-copy"><p>GPT‑5.5 and Opus 4.8 both scored 95%, yet GPT‑5.5 conducted most work off screen while Opus stayed mostly in the interface. GPT‑5.4 was the most visible. Sonnet 5 was the most expensive and persistent.</p></div>
          <div class="stat-row"><div><span>GPT‑5.4</span><b>72.7%</b><small>66.2k tokens · 12.7 rounds</small></div><div><span>GPT‑5.5</span><b>95.0%</b><small>159.7k · 16.7 rounds</small></div><div><span>Opus 4.8</span><b>95.0%</b><small>163.8k · 17.9 rounds</small></div><div><span>Sonnet 5</span><b>81.7%</b><small>307.5k · 33.8 rounds</small></div></div>
          <div class="figure-pair">${figure("assets/project/working-round-share.png", "On-screen and off-screen working-round shares by model and task type.", "Where", "Mean share of working rounds on versus off screen.")}${figure("assets/project/offscreen-onset.png", "How early each model begins off-screen work.", "When", "Normalized onset of off-screen work.")}</div>
          <div class="examples two">${example("tr_ac4c7be1bca52b35", "GPT‑5.5 · LineUp", "Inspects bundles and browser state, then analyzes the recovered data in code.", "Off-screen substitution")}${example("tr_aee13c5d7b73c83c", "Opus 4.8 · LIT", "Repairs the visual route, then independently checks the result with code.", "Visual repair + computed verification")}</div>
        </article>

        <article class="finding">
          ${findingHead("02", "RQ1 · Friction", "Agents often displaced friction instead of resolving it")}
          <div class="finding-copy"><p>GUI failures led to recovery in the interface, shifts to code, mixed strategies, or unresolved endings. Moving off screen introduced a second failure surface: dependencies, data access, parsing, and command errors.</p><div class="metric-row"><div><b>46</b><span>GUI-friction episodes</span></div><div><b>49</b><span>error-bearing traces</span></div><div><b>28%</b><span>GUI episodes unrepaired</span></div></div></div>
          ${figure("assets/project/friction-flows.png", "Flows from GUI and engineering breakdowns to responses and evidence.", "Breakdown → response → evidence", "An agent may recover the answer without repairing the failed interface.")}
          <div class="examples">${example("tr_7aa582985ead8650", "Opus 4.8 · SandDance", "A failed dropdown leads to a broken code bypass, then a return to successful GUI work.", "Cross-channel recovery")}${example("tr_730f0dfa05bca83d", "GPT‑5.4 · USGS", "After a misgrounded manipulation, it computes the result without repairing the view.", "Answer recovered; view unrepaired")}${example("tr_424243bfa9d320a5", "GPT‑5.5 · Gapminder", "Changes dependencies and data sources before recomputing a grounded result.", "Engineering recovery")}</div>
        </article>

        <article class="finding">
          ${findingHead("03", "RQ1 · Evidence", "Visible work was neither necessary nor sufficient for trustworthy evidence")}
          <div class="finding-copy"><p>Some claims were visibly grounded in the interface. Others were grounded in computation but hard for a collaborator to inspect. The riskiest cases combined visible activity with misgrounded or fabricated evidence.</p></div>
          ${figure("assets/project/evidence-visibility.png", "Action visibility plotted against evidence grounding for each trajectory.", "Visibility × grounding", "Each dot is one trajectory; group means reveal distinct auditability profiles.")}
          <div class="profile-grid"><div><b>Visible + grounded</b><span>Readily inspectable evidence.</span></div><div><b>Hidden + grounded</b><span>Supported, but costly to audit.</span></div><div><b>Visible + ungrounded</b><span>Activity without support.</span></div><div><b>Hidden + ungrounded</b><span>Neither process nor evidence is reliable.</span></div></div>
          <div class="examples">${example("tr_ac736c74cc47e0c9", "Grounded visual", "The claim is read from a visible Gapminder tooltip.", "Cheap to inspect")}${example("tr_c953e1cb79849f1f", "Computed evidence", "The result comes from code without in-app reconciliation.", "Grounded, but opaque")}${example("tr_475d111272ead831", "Visible but fabricated", "Repeated Vitessce clicks never repair the target, yet the answer claims a comparison.", "Misplaced trust")}</div>
        </article>

        <article class="finding">
          ${findingHead("04", "RQ2 · General web", "Tool switching is common on the web, but in VA it can replace the analysis")}
          <div class="finding-copy"><p>In 120 matched GAIA trajectories, search and shell dominated while direct GUI manipulation represented only 1.8% of calls. On general-web tasks, an off-screen route changes information retrieval. In visual analytics, it can change how evidence is produced, interpreted, and shared.</p><p style="margin-top:18px"><a class="text-link" href="gaia/">Review GAIA traces →</a></p></div>
        </article>

        <article class="finding">
          ${findingHead("05", "RQ3 · Humans and agents", "Humans and agents treated the interface as different epistemic resources")}
          <div class="finding-copy"><p>People stayed in the interface, learned its affordances through exploration, and used prior expectations as revisable hypotheses. Agents more often converted uncertainty into computation, a named target, or recalled data.</p><div class="metric-row"><div><b>94.0%</b><span>human mean score</span></div><div><b>67/120</b><span>agent traces with off-screen work</span></div><div><b>37/120</b><span>with prior-knowledge injection</span></div></div></div>
          ${figure("assets/project/human-agent-comparison.png", "Aggregated replay comparison of human and agent trajectories.", "Same tasks, different practices", "People construct and inspect evidence in the shared interface; agents branch more readily into computation and recalled knowledge.")}
        </article>
      </div>
    </section>

    <section class="section design" id="design">
      <div class="wrap"><header class="section-head"><p class="eyebrow">Design opportunities</p><h2>Build shared analytical workspaces, not parallel private ones</h2><p>Reliable collaboration requires more than placing a person and an agent in the same interface.</p></header><div class="principles"><article><span>01</span><h3>Make intent steerable</h3><p>Expose scope, assumptions, and goals before they harden into actions.</p></article><article><span>02</span><h3>Reconcile work visually</h3><p>Translate off-screen computation back into editable filters, views, and provenance.</p></article><article><span>03</span><h3>Make evidence mutually legible</h3><p>Show mappings, uncertainty, and assumptions behind visual and computed claims.</p></article><article><span>04</span><h3>Support analytical branches</h3><p>Let people compare, merge, revise, or reject complementary paths before delivery.</p></article></div></div>
    </section>

    <section class="section" id="resources">
      <div class="wrap"><header class="section-head"><p class="eyebrow">Resources</p><h2>Inspect the evidence behind the study</h2></header><div class="resource-grid"><a href="traces/"><span>01</span><h3>Trace browser</h3><p>Replay 120 WebVA agent trajectories round by round.</p><b>Open traces →</b></a><a href="analysis/"><span>02</span><h3>Interactive analysis</h3><p>Explore performance, friction, visibility, and grounding.</p><b>Open analysis →</b></a><a href="gaia/"><span>03</span><h3>General-web traces</h3><p>Review the matched GAIA comparison sample.</p><b>Open GAIA →</b></a><a href="https://github.com/ppphhhleo/webVA-agent-traces" target="_blank" rel="noreferrer"><span>04</span><h3>Code and data</h3><p>Access derived data, plot files, and build scripts.</p><b>View repository ↗</b></a></div></div>
    </section>
  </main>

  <footer><p><strong>Do AI Agents Really Conduct Visual Analytics?</strong><br>Tracing hidden trajectories behind successful answers.</p><nav><a href="#top">Top</a><a href="traces/">Traces</a><a href="analysis/">Analysis</a><a href="gaia/">GAIA</a></nav></footer>
  <dialog id="lightbox" aria-label="Expanded figure"><button type="button" aria-label="Close figure">Close ×</button><img alt=""></dialog>
`;

function figure(src, alt, label, caption) {
  return `<figure class="figure"><button class="figure-button" type="button" data-figure="${src}" data-alt="${alt}" aria-label="Expand figure"><img src="${src}" alt="${alt}" loading="lazy"></button><figcaption><b>${label}</b><span>${caption}</span></figcaption></figure>`;
}

function pdfPreview(previewSrc, pdfSrc, alt, label, caption) {
  return `<figure class="figure"><button class="figure-button" type="button" data-figure="${previewSrc}" data-alt="${alt}" aria-label="Expand figure"><img src="${previewSrc}" alt="${alt}" loading="eager"></button><figcaption><b>${label}</b><span>${caption}</span><a class="text-link" href="${pdfSrc}" target="_blank" rel="noreferrer">PDF ↗</a></figcaption></figure>`;
}

function findingHead(number, kicker, title) {
  return `<header class="finding-head"><span class="finding-number">${number}</span><div><p class="eyebrow">${kicker}</p><h3>${title}</h3></div></header>`;
}

function example(traceId, label, description, kind) {
  return `<a class="example" href="traces/#trace=${traceId}"><span>${label}</span><strong>${description}</strong><small>${kind}</small></a>`;
}

document.head.insertAdjacentHTML("beforeend", `<style>${styles}</style>`);
document.body.innerHTML = markup;

const lightbox = document.querySelector("#lightbox");
const lightboxImage = lightbox?.querySelector("img");
document.querySelectorAll("[data-figure]").forEach(button => {
  button.addEventListener("click", () => {
    lightboxImage.src = button.dataset.figure;
    lightboxImage.alt = button.dataset.alt || "Expanded research figure";
    lightbox.showModal();
  });
});
lightbox?.querySelector("button")?.addEventListener("click", () => lightbox.close());
lightbox?.addEventListener("click", event => { if (event.target === lightbox) lightbox.close(); });
