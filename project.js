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
  body { margin: 0; color: var(--ink); background: var(--paper-soft); font-family: var(--sans); font-size: 15px; line-height: 1.6; }
  img { display: block; max-width: 100%; }
  a { color: inherit; }
  button { font: inherit; }
  .skip-link { position: fixed; left: 12px; top: -80px; z-index: 100; padding: 8px 12px; background: #fff; border: 1px solid var(--ink); }
  .skip-link:focus { top: 12px; }

  .site-header { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 20px; height: 64px; padding: 0 24px; background: #fcfaf5; border-bottom: 1px solid var(--line); }
  .brand { display: flex; gap: 11px; align-items: center; color: inherit; text-decoration: none; }
  .brand > span:last-child { display: flex; flex-direction: column; line-height: 1.05; }
  .brand strong { font-family: var(--serif); font-size: 23px; letter-spacing: -.02em; }
  .brand small { margin-top: 5px; color: var(--muted); font-size: 10px; letter-spacing: .16em; text-transform: uppercase; }
  .brand-mark { position: relative; display: block; width: 30px; height: 30px; border: 1px solid var(--teal); border-radius: 50%; }
  .brand-mark i { position: absolute; width: 6px; height: 6px; background: var(--teal); border-radius: 50%; }
  .brand-mark i:nth-child(1) { left: 6px; top: 7px; }
  .brand-mark i:nth-child(2) { right: 5px; top: 11px; }
  .brand-mark i:nth-child(3) { left: 10px; bottom: 4px; }
  .site-nav { display: flex; align-items: center; gap: 18px; }
  .site-nav a { color: var(--ink); font-size: 13px; text-decoration: none; }
  .site-nav a:hover, .site-nav a:focus-visible, .site-nav .nav-current { color: var(--teal-dark); }
  .site-nav .nav-current { font-weight: 700; }
  .github-link { padding-bottom: 2px; border-bottom: 1px solid var(--line); }

  .wrap { width: min(1040px, calc(100% - 40px)); margin: 0 auto; }
  .hero-shell { background: var(--paper); border-bottom: 1px solid var(--line); }
  .hero { max-width: 1220px; margin: 0 auto; padding: 62px 20px 52px; text-align: center; }
  .eyebrow { margin: 0 0 10px; color: var(--teal-dark); font-size: 12px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
  h1, h2, h3 { font-family: var(--serif); }
  h1 { max-width: none; margin: 0 auto; font-size: clamp(30px, 3.4vw, 40px); line-height: 1.14; letter-spacing: -.022em; }
  .subtitle { margin: 10px 0 0; color: #415154; font-size: clamp(17px, 1.8vw, 21px); }
  .abstract { max-width: 790px; margin: 24px auto 0; color: #394b4e; font-size: 16px; line-height: 1.68; }

  main section { scroll-margin-top: 20px; }
  .section { padding: 70px 0; border-bottom: 1px solid var(--line); }
  .section-head { max-width: 760px; margin-bottom: 28px; }
  .section-head.centered { margin-right: auto; margin-left: auto; text-align: center; }
  .teaser .section-head { max-width: 1000px; }
  .section-head h2 { margin: 0; font-size: clamp(24px, 2.5vw, 31px); line-height: 1.18; letter-spacing: -.016em; }
  .section-head p:last-child { margin: 13px 0 0; color: var(--muted); font-size: 16px; }

  .figure { margin: 0; background: var(--panel); border: 1px solid var(--line); }
  .figure-button { width: 100%; padding: 0; cursor: zoom-in; background: var(--panel); border: 0; }
  .figure img { width: 100%; height: auto; object-fit: contain; background: var(--panel); }
  .figure figcaption { display: flex; gap: 12px; padding: 12px 15px; color: var(--muted); background: var(--panel); border-top: 1px solid var(--line); font-size: 13px; }
  .figure figcaption b { color: var(--ink); }
  .teaser .figure, .finding > .figure { width: min(92%, 960px); margin-right: auto; margin-left: auto; }
  .teaser .figure { box-shadow: 0 8px 24px rgba(25, 54, 58, .07); }

  .text-link { color: var(--teal-dark); font-weight: 700; text-decoration-thickness: 1px; text-underline-offset: 3px; }

  .findings-title { padding-bottom: 26px; }
  .finding { padding: 64px 0; border-top: 1px solid var(--line); }
  .finding-head { display: grid; grid-template-columns: 52px minmax(0, 760px); gap: 18px; align-items: start; margin-bottom: 26px; }
  .finding-number { padding-top: 5px; color: var(--teal-dark); font-family: var(--mono); font-size: 15px; }
  .finding-head h3 { margin: 0; font-size: clamp(22px, 2.3vw, 28px); line-height: 1.2; }
  .finding-copy { max-width: 850px; margin-left: 70px; color: #405154; font-size: 16px; }
  .finding-copy p { margin: 0; }
  .finding-list { margin: 0; padding-left: 1.2em; }
  .finding-list li { margin: 0 0 12px; padding-left: 5px; line-height: 1.55; }
  .finding-list li:last-child { margin-bottom: 0; }
  .finding-list strong { color: var(--ink); }
  .stat-row { display: grid; grid-template-columns: repeat(4, 1fr); margin: 28px 0; border: 1px solid var(--line); background: var(--panel); }
  .stat-row div { padding: 15px; border-right: 1px solid var(--line); }
  .stat-row div:last-child { border-right: 0; }
  .stat-row span, .stat-row small { display: block; }
  .stat-row span { color: var(--muted); font-size: 12px; font-weight: 700; text-transform: uppercase; }
  .stat-row b { color: var(--teal-dark); font-family: var(--mono); font-size: 21px; }
  .stat-row small { color: var(--muted); font-size: 12px; }
  .figure-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; margin-top: 28px; }
  .figure-pair + .figure { margin-top: 18px; }
  .examples { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 18px; }
  .examples.two { grid-template-columns: repeat(2, 1fr); }
  .example { display: block; min-height: 126px; padding: 15px; background: var(--panel); border: 1px solid var(--line); text-decoration: none; }
  .example:hover, .example:focus-visible { border-color: #6da7a4; outline: 2px solid #d6ecea; }
  .example span, .example small { display: block; }
  .example span { margin-bottom: 7px; color: var(--teal-dark); font-size: 12px; font-weight: 800; text-transform: uppercase; }
  .example strong { font-size: 14px; line-height: 1.45; }
  .example small { margin-top: 10px; color: var(--muted); }
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

  dialog { width: min(94vw, 1500px); max-height: 94vh; padding: 42px 16px 16px; border: 1px solid #829496; background: #fff; }
  dialog::backdrop { background: rgba(15, 35, 38, .78); }
  dialog img { width: 100%; max-height: 82vh; object-fit: contain; background: #fff; }
  dialog button { position: absolute; right: 12px; top: 10px; padding: 5px 9px; background: #fff; border: 1px solid var(--line); cursor: pointer; }

  @media (max-width: 820px) {
    .site-header { height: auto; min-height: 64px; padding: 10px 16px; }
    .site-nav { gap: 12px; }
    .site-nav .github-link { display: none; }
    .hero { padding-top: 48px; }
    .figure-pair { grid-template-columns: 1fr; }
    .teaser .figure, .finding > .figure { width: 100%; }
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
    h1 { font-size: 28px; white-space: normal !important; overflow-wrap: anywhere; }
    .hero { padding: 42px 16px 38px; }
    .section { padding: 50px 0; }
    .finding { padding: 48px 0; }
    .finding-head { grid-template-columns: 36px 1fr; gap: 10px; }
    .finding-copy { margin-left: 46px; font-size: 15px; }
    .stat-row, .profile-grid, .principles, .resource-grid { grid-template-columns: 1fr; }
    .stat-row div, .profile-grid div, .principles article, .resource-grid a { border-right: 0; border-bottom: 1px solid var(--line); }
    .stat-row div:last-child, .profile-grid div:last-child, .principles article:last-child, .resource-grid a:last-child { border-bottom: 0; }
    .site-header { grid-template-columns: 1fr; gap: 8px; }
    .site-nav { justify-content: flex-start; flex-wrap: wrap; column-gap: 22px; row-gap: 6px; }
  }

  @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
`;

const markup = `
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <a class="brand" href="./" aria-label="WebVA project home"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span><strong>WebVA</strong><small>Agent Traces</small></span></a>
    <nav class="site-nav" aria-label="Primary navigation"><a class="nav-current" href="./" aria-current="page">Project</a><a href="analysis/">Analysis</a><a href="traces/">All traces</a><a href="gaia/">GAIA</a><a class="github-link" href="https://github.com/ppphhhleo/webVA-agent-traces" target="_blank" rel="noreferrer">View source <span aria-hidden="true">↗</span></a></nav>
  </header>
  <main id="main">
    <div class="hero-shell" id="top">
      <section class="hero">
        <p class="eyebrow">Agentic visual analytics</p>
        <h1>Do AI Agents Really Conduct Visual Analytics?</h1>
        <p class="subtitle">Tracing hidden trajectories behind successful answers</p>
        <p class="abstract">AI agents are increasingly used to conduct visual analytics (VA) tasks, yet existing studies report task success and overlook the open-ended, multi-step process behind it. It remains unclear whether a correct answer reflects reliable, well-grounded VA. To examine this, we collected 240 agent and human trajectories on 30 VA tasks, plus 120 public general-web agent traces, and developed TraLens, a toolkit for analyzing the corpus. In total, the corpus contains 10.2 hours of activity and 6,607 agent actions. Our analysis reveals surprising agent behaviors hidden beneath their success rates: agents often ignore the VA tool, drifting off to read raw data and compute in code, and sometimes fabricate evidence. Such behavior departs from reliable VA exploration, where visual insights inform each next step and ground the conclusion, and undermines the human–agent paradigm in which humans oversee agents and intervene when needed. These findings underscore the need for shared VA workspaces that expose agent activity and support human steering.</p>
      </section>
    </div>

    <section class="section teaser" aria-labelledby="teaser-title">
      <div class="wrap">
        <header class="section-head centered"><p class="eyebrow">The central problem</p><h2 id="teaser-title">Same question, different analytical paths</h2><p>A human works through the visible interface. Agents mix GUI actions with code, bypass the interface, or substitute prior knowledge. The conclusions may all sound plausible, while their evidence differs sharply.</p></header>
        ${pdfPreview("assets/project/agent-traces-teaser-l.png", "Different analytical paths through the same wine visualization task.")}
      </div>
    </section>

    <section class="section" id="findings">
      <div class="wrap">
        <header class="section-head findings-title"><p class="eyebrow">Findings</p><h2>Similar outcomes, different analytical trajectories</h2><p>The results follow the paper's three questions: how agents conduct visual analytics, what changes beyond visual analytics, and how agent practices differ from human analysis.</p></header>

        <article class="finding">
          ${findingHead("01", "RQ1.1 · Behavioral signatures", "Four models, four ways of working")}
          <div class="finding-copy"><ul class="finding-list"><li><strong>GPT‑5.4 — GUI-first but brittle:</strong> it kept 88.5% of working rounds on screen, yet frequently misgrounded interface actions.</li><li><strong>GPT‑5.5 — code-first and infrastructure-oriented:</strong> it conducted 66.2% of working rounds off screen, often inspecting bundles, APIs, and browser state before computing answers.</li><li><strong>Opus 4.8 — late, decisive escalation:</strong> it stayed mostly in the interface and moved off screen later, using code selectively to verify or finish the analysis.</li><li><strong>Sonnet 5 — persistent cross-channel grinding:</strong> despite nearly the same overall on/off-screen split as Opus, it moved off screen earlier and continued for far more rounds.</li></ul></div>
          ${figure("assets/project/behavior-trace-prevalence-preview.png", "assets/project/behavior-trace-prevalence.svg", 1200, 1148, "Prevalence of coded agent behaviors by model and task type.", "Behavior signatures", "Trace prevalence of on-screen work, channel switching, off-screen work, answer delivery, and task interpretation.")}
          <div class="examples two">${example("tr_759cc42b6b434d91", "GPT‑5.5 · LineUp", "Inspects bundles and browser state, then analyzes the recovered data in code.", "Off-screen substitution")}${example("tr_aee13c5d7b73c83c", "Opus 4.8 · LIT", "Repairs the visual route, then independently checks the result with code.", "Visual repair + computed verification")}</div>
        </article>

        <article class="finding">
          ${findingHead("02", "RQ1.2 · Friction handling", "Agents often displaced friction instead of resolving it")}
          <div class="finding-copy"><p>Across <strong>46 GUI-friction episodes</strong>, failures led to recovery in the interface, shifts to code, mixed strategies, or unresolved endings; <strong>28% finished without GUI repair or remained unresolved</strong>. Moving off screen introduced a second failure surface: <strong>49 traces contained engineering errors</strong> involving dependencies, data access, parsing, or commands.</p></div>
          ${figure("assets/project/engineering-friction-flow-preview.png", "assets/project/engineering-friction-flow.svg", 1200, 436, "Engineering errors flowing through recovery responses to evidence outcomes.", "Engineering friction", "Dependency, access, parsing, and command errors lead to several recovery routes and evidence outcomes.")}
          <div class="examples">${example("tr_7aa582985ead8650", "Opus 4.8 · SandDance", "A failed dropdown leads to a broken code bypass, then a return to successful GUI work.", "Cross-channel recovery")}${example("tr_730f0dfa05bca83d", "GPT‑5.4 · USGS", "After a misgrounded manipulation, it computes the result without repairing the view.", "Answer recovered; view unrepaired")}${example("tr_424243bfa9d320a5", "GPT‑5.5 · Gapminder", "Changes dependencies and data sources before recomputing a grounded result.", "Engineering recovery")}</div>
        </article>

        <article class="finding">
          ${findingHead("03", "RQ1.3 · Evidence grounding", "Visible work was neither necessary nor sufficient for trustworthy evidence")}
          <div class="finding-copy"><p>Some claims were visibly grounded in the interface. Others were grounded in computation but hard for a collaborator to inspect. The riskiest cases combined visible activity with misgrounded or fabricated evidence.</p></div>
          ${figure("assets/project/evidence-visibility-both-preview.png", "assets/project/evidence-visibility-both.svg", 1200, 654, "Action visibility plotted against evidence grounding by agent and task type.", "Visibility × grounding", "Each dot is one trajectory; the two panels summarize differences by agent and task type.")}
          <div class="profile-grid"><div><b>Visible + grounded</b><span>Readily inspectable evidence.</span></div><div><b>Hidden + grounded</b><span>Supported, but costly to audit.</span></div><div><b>Visible + ungrounded</b><span>Activity without support.</span></div><div><b>Hidden + ungrounded</b><span>Neither process nor evidence is reliable.</span></div></div>
          <div class="examples">${example("tr_ac736c74cc47e0c9", "Grounded visual", "The claim is read from a visible Gapminder tooltip.", "Cheap to inspect")}${example("tr_c953e1cb79849f1f", "Computed evidence", "The result comes from code without in-app reconciliation.", "Grounded, but opaque")}${example("tr_475d111272ead831", "Visible but fabricated", "Repeated Vitessce clicks never repair the target, yet the answer claims a comparison.", "Misplaced trust")}</div>
        </article>

        <article class="finding">
          ${findingHead("04", "RQ2 · General web", "Tool switching is common on the web, but in VA it can replace the analysis")}
          <div class="finding-copy"><p>In 120 matched GAIA trajectories, search and shell dominated while direct GUI manipulation represented only 1.8% of calls. On general-web tasks, an off-screen route changes information retrieval. In visual analytics, it can change how evidence is produced, interpreted, and shared.</p><p style="margin-top:18px"><a class="text-link" href="gaia/">Review GAIA traces →</a></p></div>
        </article>

        <article class="finding">
          ${findingHead("05", "RQ3 · Humans and agents", "Humans worked through the interface; agents often worked around it")}
          <div class="finding-copy"><ul class="finding-list"><li><strong>Humans used the interface as a shared epistemic workspace:</strong> they explored its affordances, compared visible evidence, and revised prior expectations as hypotheses.</li><li><strong>Agents often treated the interface as a launch point:</strong> 67 of 120 traces moved into code, shell, files, or web resources, and 37 injected prior knowledge not established in the visualization.</li><li><strong>Similar answers had unequal inspectability:</strong> humans built conclusions from evidence visible in the shared interface. Agents could reach correct answers through hidden computation—or produce unsupported claims despite extensive visible activity.</li><li><strong>Agent collaboration requires epistemic—not merely operational—control:</strong> humans could inspect and revise the evidence supporting their own conclusions. Collaborators therefore need equivalent ways to examine, validate, and challenge an agent’s reasoning—not only pause, prompt, or restart it.</li></ul></div>
        </article>
      </div>
    </section>

    <section class="section design" id="design">
      <div class="wrap"><header class="section-head"><p class="eyebrow">Design opportunities</p><h2>Build shared analytical workspaces, not parallel private ones</h2><p>Reliable collaboration requires more than placing a person and an agent in the same interface.</p></header><div class="principles"><article><span>01</span><h3>Make intent steerable</h3><p>Expose scope, assumptions, and goals before they harden into actions.</p></article><article><span>02</span><h3>Reconcile work visually</h3><p>Translate off-screen computation back into editable filters, views, and provenance.</p></article><article><span>03</span><h3>Make evidence mutually legible</h3><p>Show mappings, uncertainty, and assumptions behind visual and computed claims.</p></article><article><span>04</span><h3>Support analytical branches</h3><p>Let people compare, merge, revise, or reject complementary paths before delivery.</p></article></div></div>
    </section>

  </main>
  <dialog id="lightbox" aria-label="Expanded figure"><button type="button" aria-label="Close figure">Close ×</button><img alt=""></dialog>
`;

function figure(previewSrc, fullSrc, width, height, alt, label, caption) {
  return `<figure class="figure"><button class="figure-button" type="button" data-figure="${fullSrc}" data-alt="${alt}" aria-label="Expand figure"><img src="${previewSrc}" width="${width}" height="${height}" alt="${alt}" loading="lazy" decoding="async" fetchpriority="low"></button><figcaption><b>${label}</b><span>${caption}</span></figcaption></figure>`;
}

function pdfPreview(previewSrc, alt) {
  return `<figure class="figure"><button class="figure-button" type="button" data-figure="${previewSrc}" data-alt="${alt}" aria-label="Expand figure"><img src="${previewSrc}" width="1467" height="810" alt="${alt}" loading="eager" decoding="async" fetchpriority="high"></button></figure>`;
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
