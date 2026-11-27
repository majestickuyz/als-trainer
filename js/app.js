import { CASES, getCase, nextCaseId, randomCaseId } from "./cases.js";
import { CAUSES } from "./causes.js";
import { DOSE_NOTE, MOVES, RHYTHMS, activeNodes, drugPlan, predictionCorrect } from "./explore-model.js";
import { act, etco2, formatClock, readout, startCase } from "./engine.js";
import { SKIP_ACTIONS, STAGES, currentCard, drawerModel, splitScreen, stageLog, stageStatus, stageVerdict } from "./guide.js";
import { mountTrace, rhythmMeta } from "./rhythm.js";
import { clearRecord, loadRecord, saveResult, shiftStats } from "./store.js";

const DISCLAIMER = "Educational tool, not a substitute for RCUK ALS training or local policy.";
const SOURCE = "Resuscitation Council UK 2025 Adult ALS algorithm.";

let record = loadRecord();
let route = { view: "cases" };
let caseState = null;
let guide = null;
let traceCtl = null;
let dwellTimer = 0;
let playTimer = 0;
let explore = {
  rhythm: "vf",
  cycle: 1,
  peaStyle: "narrow",
  predict: false,
  move: null,
  drugs: [],
  revealed: false,
  blind: false,
  cause: "hypoxia",
  playing: false,
};

const app = document.getElementById("app");

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function parseHash() {
  const raw = (location.hash || "#cases").replace(/^#/, "");
  if (raw.startsWith("case/")) return { view: "case", id: decodeURIComponent(raw.slice(5)) };
  if (raw === "explore" || raw === "about") return { view: raw };
  return { view: "cases" };
}

function themeNow() {
  const set = document.documentElement.getAttribute("data-theme");
  if (set) return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function shell() {
  app.innerHTML = `
    <div class="wrap">
      <header class="top">
        <a class="brand" href="#cases">
          <svg class="logo" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="#171e2e"/>
            <path d="M4 18.5h5.5l2.2-6 3.2 11 2.4-7 1.6 2h9" fill="none" stroke="#3dde8a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>
            <strong>ALS TRAINER</strong>
            <em>One patient at a time, on a real clock.</em>
          </span>
        </a>
        <nav class="nav" aria-label="Primary">
          <a href="#cases" data-nav="cases">Cases</a>
          <a href="#explore" data-nav="explore">Explore</a>
          <a href="#about" data-nav="about">About</a>
        </nav>
        <div class="top-actions">
          <button type="button" class="ghost" id="install" hidden>Install</button>
          <button type="button" class="ghost" id="theme" data-act="theme">Dark</button>
        </div>
      </header>
      <main id="main"></main>
      <footer class="foot">
        <div>${esc(DISCLAIMER)}</div>
        <div>Source: ${esc(SOURCE)} Drug doses, where shown, are labelled as the RCUK 2025 guideline text. The algorithm card itself prints timing, not dose.</div>
      </footer>
    </div>`;
}

function chrome() {
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const on = link.dataset.nav === route.view || (route.view === "case" && link.dataset.nav === "cases");
    if (on) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  const theme = document.getElementById("theme");
  if (theme) theme.textContent = themeNow() === "dark" ? "Light" : "Dark";
}

function stopTrace() {
  traceCtl?.stop();
  traceCtl = null;
}

function stopPlay() {
  explore.playing = false;
  clearInterval(playTimer);
  playTimer = 0;
}

function freshGuide() {
  return { limb: null, seenFindings: 0, review: null, drawer: false, dwellAt: 0, dwellPhase: "", nudged: "", cardId: "", skipAirway: false, skipCapno: false, stamps: {} };
}

function skipPref() {
  try { return localStorage.getItem("als-skip-intro") === "1"; } catch { return false; }
}

function beginCase(id) {
  caseState = startCase(id);
  guide = freshGuide();
  if (skipPref()) {
    for (const step of SKIP_ACTIONS) caseState = act(caseState, step);
    noteStamps();
  }
}

function noteStamps() {
  if (!guide || !caseState) return;
  const flags = {
    recognise: caseState.safety,
    help: caseState.help,
    cpr: caseState.cprEver,
    defib: caseState.defib,
    rhythm: caseState.assessCount > 0,
    treat: !!(caseState.access || caseState.adrenalineAt.length || caseState.amio || Object.keys(caseState.treatMarks).length),
    rosc: caseState.hadRosc || caseState.confirmedRosc,
  };
  for (const [id, ok] of Object.entries(flags)) {
    if (ok && guide.stamps[id] == null) guide.stamps[id] = caseState.t;
  }
}

function paint() {
  const main = document.getElementById("main");
  chrome();
  document.body.classList.toggle("is-guided", route.view === "case");
  if (route.view !== "case") {
    clearInterval(dwellTimer);
    dwellTimer = 0;
  }
  if (route.view === "case") renderCase(main);
  else if (route.view === "explore") renderExplore(main);
  else {
    clearInterval(dwellTimer);
    dwellTimer = 0;
    stopTrace();
    stopPlay();
    main.dataset.view = route.view;
    main.innerHTML = route.view === "about" ? aboutView() : casesView();
  }
}

function casesView() {
  const stats = shiftStats(record);
  const rows = CASES.map((c, i) => {
    const best = record.cases[c.id];
    return `<button class="case-link" type="button" data-open="${esc(c.id)}">
      <span class="idx">${i + 1}</span>
      <span><strong>${esc(c.title)}</strong><span>${esc(c.complaint)}</span></span>
      <span class="best">${best ? `best ${best.best}` : ""}</span>
    </button>`;
  }).join("");
  const shift = stats
    ? `<div class="stats">
        <div class="stat"><strong>${stats.n}</strong><span>cases</span></div>
        <div class="stat"><strong>${stats.mean}</strong><span>mean score</span></div>
        <div class="stat"><strong>${stats.passes}/${stats.n}</strong><span>passes</span></div>
        <div class="stat"><strong>${stats.fails}</strong><span>fails</span></div>
        <div class="stat"><strong>${stats.zeros}</strong><span>critical fails</span></div>
      </div>
      <button type="button" class="ghost" data-act="clear">Clear record</button>`
    : `<p class="small">No cases debriefed yet. Scores stay on this device.</p>`;
  return `<div class="layout">
    <section class="card">
      <p class="kicker">Serial cases</p>
      <h1>One patient at a time, on a real clock.</h1>
      <p>Each case starts with a patient in cardiac arrest. Start CPR, attach the defibrillator, read the rhythm, shock or hold, give the drugs on the clock, and look for a reversible cause. Every action moves the clock on. The rhythm underneath can change between cycles. Some arrests convert from non-shockable to shockable, or the other way. ROSC follows the right treatment. One case re-arrests.</p>
      <p>You are scored on how closely the timing matches the algorithm: shocks, adrenaline, amiodarone, pauses in CPR, and the reversible causes. A critical error — shocking asystole or PEA, or missing an obvious treatable cause — fails the case.</p>
      <p class="small">${esc(DISCLAIMER)} Source: ${esc(SOURCE)}</p>
    </section>
    <aside class="side-stack">
      <section class="card">
        <p class="kicker">Cases</p>
        <h2>Run the arrest.</h2>
        <p class="small">Ten patients. The cause is hidden until the debrief. Each case is one step at a time until the defibrillator is on.</p>
        <label class="skip-pref"><input type="checkbox" data-act="skip-pref" ${skipPref() ? "checked" : ""}> Experienced: start with the defibrillator on</label>
        <button type="button" class="primary" data-act="random" style="margin:10px 0">Random case</button>
        <div class="case-list">${rows}</div>
      </section>
      <section class="card">
        <p class="kicker">Your shift so far</p>
        ${shift}
      </section>
    </aside>
  </div>`;
}

function renderCase(main) {
  if (!caseState || !guide) return;
  if (main.dataset.view !== "case") {
    stopTrace();
    stopPlay();
    main.dataset.view = "case";
    main.innerHTML = `<div class="guide">
      <div class="rail-bar">
        <div class="rail" id="rail" role="tablist" aria-label="Arrest stages"></div>
        <div class="rail-end">
          <span class="mono rail-clock" id="rail-clock">0:00</span>
          <button type="button" class="texty" data-act="theme">Dark</button>
          <a class="texty" href="#cases">Exit</a>
        </div>
      </div>
      <p id="guide-crit" class="banner-crit" hidden></p>
      <div class="guide-body" id="guide-body">
        <section class="monitor-dock" id="monitor-dock" hidden>
          <div class="dock-top">
            <span class="kicker" id="mon-name">Monitor</span>
            <span class="mono" id="mon-hr"></span>
          </div>
          <canvas id="trace" role="img" aria-label="Defibrillator monitor"></canvas>
          <p id="mon-cap" class="dock-cap"></p>
          <div class="dock-stats">
            <div class="ring-wrap" id="cycle-ring" aria-label="CPR cycle"></div>
            <div><span class="kicker">Cycle</span><strong class="mono" id="stat-cycle">—</strong></div>
            <div><span class="kicker">Shocks</span><strong class="mono" id="stat-shocks">0</strong></div>
            <div><span class="kicker">Since adrenaline</span><strong class="mono" id="stat-adr">—</strong></div>
            <div id="stat-etco2-wrap" hidden><span class="kicker">EtCO2</span><strong class="mono" id="stat-etco2">—</strong></div>
          </div>
        </section>
        <section class="step-pane" id="step-pane"></section>
      </div>
      <button type="button" class="drawer-tab" id="drawer-tab" hidden data-act="drawer">4Hs · 4Ts</button>
      <div class="sheet" id="sheet" hidden>
        <div class="sheet-grab" data-act="close-drawer" role="button" tabindex="0" aria-label="Close the reversible causes"></div>
        <div id="sheet-body"></div>
      </div>
    </div>`;
  }
  if (caseState.ended && !caseState._saved) {
    caseState._saved = true;
    record = saveResult(caseState);
  }
  noteStamps();
  fillGuide();
}

function traceSpec() {
  if (!caseState) return { rhythm: "none" };
  const view = readout(caseState);
  return { rhythm: view.rhythm, style: view.style, rate: view.rate };
}

function ensureTrace() {
  const canvas = document.getElementById("trace");
  if (canvas && !traceCtl) traceCtl = mountTrace(canvas, () => traceSpec());
}

function fillGuide() {
  const s = caseState;
  const status = stageStatus(s);
  const split = splitScreen(s);
  document.getElementById("rail").innerHTML = STAGES.map((stage) => {
    const state = stage.id === status.current ? "current" : status.done[stage.id] ? "done" : "wait";
    const stamp = guide.stamps[stage.id];
    const locked = !s.ended && state === "wait";
    return `<button type="button" class="chip ${state}" data-stage="${stage.id}" ${locked ? "disabled" : ""} aria-current="${state === "current" ? "step" : "false"}">
      <span class="chip-label">${esc(stage.short)}</span>
      <span class="mono chip-time">${stamp == null ? "" : esc(formatClock(stamp))}</span>
    </button>`;
  }).join("");
  document.getElementById("rail-clock").textContent = formatClock(s.t);
  const theme = document.querySelector(".rail-end [data-act=theme]");
  if (theme) theme.textContent = themeNow() === "dark" ? "Light" : "Dark";

  const crit = document.getElementById("guide-crit");
  if (s.criticals.length && !s.ended) {
    crit.hidden = false;
    crit.textContent = "Critical error recorded. The score is a fail. Carry on for the debrief.";
  } else crit.hidden = true;

  const body = document.getElementById("guide-body");
  body.classList.toggle("split", split);
  const dock = document.getElementById("monitor-dock");
  dock.hidden = !split;
  const tab = document.getElementById("drawer-tab");
  const showDrawerTab = split && !s.ended && s.phase === "cpr";
  tab.hidden = !showDrawerTab;
  if (split) {
    ensureTrace();
    paintMonitor(s);
  }
  const sheet = document.getElementById("sheet");
  sheet.hidden = !(guide.drawer && showDrawerTab);
  if (!sheet.hidden) document.getElementById("sheet-body").innerHTML = drawerHtml(s);

  const pane = document.getElementById("step-pane");
  const html = s.ended ? debriefHtml(s) : stepHtml(s);
  const nextId = s.ended ? `debrief-${guide.review || status.current}` : (guide.review ? `review-${guide.review}` : currentCard(s, guide)?.id);
  const entering = pane.dataset.card !== nextId;
  pane.dataset.card = nextId || "";
  pane.innerHTML = html;
  if (entering) pane.querySelector(".step-card")?.classList.add("is-enter");
  if (entering) maybeNudge(s);
  armDwell(s);
}

function paintMonitor(s) {
  const view = readout(s);
  const meta = rhythmMeta(view.rhythm, view.style);
  document.getElementById("mon-name").textContent = meta.name;
  document.getElementById("mon-hr").textContent = meta.hr === "—" ? "" : meta.hr;
  document.getElementById("mon-cap").textContent = meta.detail;
  document.getElementById("trace")?.setAttribute("aria-label", `Monitor showing ${meta.detail}`);
  const remain = view.cycleRemain;
  const progress = remain == null ? 0 : Math.min(1, Math.max(0, (120 - remain) / 120));
  const circ = 97.4;
  document.getElementById("cycle-ring").innerHTML = `<svg viewBox="0 0 36 36" aria-hidden="true">
      <circle class="ring-bg" cx="18" cy="18" r="15.5"></circle>
      <circle class="ring-fg" cx="18" cy="18" r="15.5" stroke-dasharray="${circ}" stroke-dashoffset="${(circ * (1 - progress)).toFixed(2)}"></circle>
    </svg><span class="mono">${remain == null ? "—" : formatClock(remain)}</span>`;
  document.getElementById("stat-cycle").textContent = s.cycleIndex ? String(s.cycleIndex) : "—";
  document.getElementById("stat-shocks").textContent = String(s.shocks);
  const age = s.adrenalineAt.length ? formatClock(s.t - s.adrenalineAt[s.adrenalineAt.length - 1]) : "—";
  document.getElementById("stat-adr").textContent = age;
  const co2 = etco2(s);
  const wrap = document.getElementById("stat-etco2-wrap");
  wrap.hidden = !co2;
  if (co2) document.getElementById("stat-etco2").textContent = co2;
}

function stepHtml(s) {
  if (guide.review) return reviewHtml(s, guide.review, false);
  const card = currentCard(s, guide);
  if (!card) return "";
  const dwell = `<p id="dwell" class="dwell" hidden>Minimise the interruption. Deliver the shock, or restart CPR.</p>`;
  const flash = s.flash ? `<p class="flash ${esc(s.flash.kind)}" role="status">${esc(s.flash.text)}</p>` : "";
  const targets = card.targets.map((target) => {
    const extra = target.item ? ` data-item="${esc(target.item)}"` : target.cause ? ` data-cause="${esc(target.cause)}"` : "";
    return `<button type="button" class="tap ${esc(target.tone || "ghost")}" data-act="${esc(target.act)}"${extra}>${esc(target.label)}</button>`;
  }).join("");
  return `<article class="step-card${card.nudge ? " nudge" : ""}" data-step="${esc(card.id)}">
    <p class="kicker">${esc(card.kicker)}</p>
    <h2>${esc(card.title)}</h2>
    <p class="step-body">${esc(card.body)}</p>
    ${flash}
    ${dwell}
    <div class="taps">${targets}</div>
  </article>`;
}

function reviewHtml(s, stageId, debrief) {
  const stage = STAGES.find((item) => item.id === stageId) || STAGES[0];
  const verdict = stageVerdict(s, stageId);
  const lines = stageLog(s, stageId, guide.stamps);
  const list = lines.length
    ? `<ol class="timeline">${lines.map((line) => `<li><span class="when mono">${esc(formatClock(line.t))}</span><span class="${esc(line.tone)}">${esc(line.text)}</span></li>`).join("")}</ol>`
    : `<p class="small">Nothing recorded on this stage.</p>`;
  return `<article class="step-card review-card">
    <p class="kicker">${debrief ? "Debrief" : "Read only"} · ${esc(stage.label)}</p>
    <h2>${esc(stage.label)}${guide.stamps[stageId] != null ? ` · ${esc(formatClock(guide.stamps[stageId]))}` : ""}</h2>
    <p class="expect"><span class="mark ${verdict.ok ? "ok" : "no"}">${verdict.ok ? "Met" : "Not met"}</span> ${esc(verdict.expected)}</p>
    ${list}
    ${debrief ? "" : `<button type="button" class="tap ghost" data-act="close-review">Back to the step</button>`}
  </article>`;
}

function debriefHtml(s) {
  const c = getCase(s.caseId);
  const best = record.cases[c.id];
  const focus = guide.review || stageStatus(s).current;
  const deductions = [
    ...s.criticals.map((item) => `<li><strong>Fail.</strong> ${esc(item.text)}</li>`),
    ...s.penalties.map((item) => `<li><span class="mono">−${item.points}</span> ${esc(item.text)}</li>`),
  ].join("");
  return `<div class="debrief-grid">
    <section class="card debrief">
      <p class="kicker">Debrief</p>
      <h2>${esc(s.headline)}</h2>
      <div class="score-row"><strong>${s.score}</strong><span>/100</span><em class="grade">${esc(s.grade)}</em></div>
      <p>${esc(c.truth)}</p>
      <dl class="metrics">${s.metrics.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
      ${deductions ? `<ul class="deductions">${deductions}</ul>` : `<p>No deductions. Timing and limb both held.</p>`}
      <p class="small">Best on this device: ${best ? best.best : s.score}. ${esc(DISCLAIMER)}</p>
      <div class="btn-row">
        <button type="button" class="primary" data-act="next">Next case</button>
        <a class="ghost" href="#explore">Open explore</a>
        <a class="texty" href="#cases">All cases</a>
      </div>
    </section>
    ${reviewHtml(s, focus, true)}
    <section class="card">
      <p class="kicker">From this case</p>
      <ul class="deductions">${c.learn.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
    </section>
  </div>`;
}

function drawerHtml(s) {
  const model = drawerModel(s);
  const button = (item) => {
    const extra = item.id ? ` data-cause="${esc(item.id)}"` : "";
    return `<button type="button" class="action" data-act="${esc(item.act)}"${extra} ${item.done ? "disabled" : ""}><strong>${esc(item.label)}</strong>${item.done ? "<small>Done</small>" : ""}</button>`;
  };
  const flash = s.flash ? `<p class="flash ${esc(s.flash.kind)}">${esc(s.flash.text)}</p>` : "";
  return `${flash}
    <p class="kicker">Look</p>
    ${model.look.map(button).join("")}
    <p class="kicker">Consider</p>
    ${model.consider.map(button).join("")}
    <p class="kicker">Drugs, if you already have access</p>
    ${model.drugs.map(button).join("")}
    <p class="kicker">4Hs and 4Ts</p>
    <div class="cause-grid">${model.causes.map(button).join("")}</div>
    <button type="button" class="tap ghost" data-act="close-drawer">Close</button>`;
}

function maybeNudge(s) {
  const card = s.ended ? null : currentCard(s, guide);
  if (!card?.nudge) return;
  const key = card.id;
  if (guide.nudged === key) return;
  guide.nudged = key;
  try { navigator.vibrate?.(18); } catch { /* optional */ }
}

function armDwell(s) {
  const watching = s && !s.ended && (s.phase === "decision" || s.phase === "postshock");
  if (!watching) {
    guide.dwellAt = 0;
    guide.dwellPhase = "";
    clearInterval(dwellTimer);
    dwellTimer = 0;
    return;
  }
  if (!guide.dwellAt || guide.dwellPhase !== s.phase + (guide.limb || "")) {
    guide.dwellAt = performance.now();
    guide.dwellPhase = s.phase + (guide.limb || "");
  }
  if (!dwellTimer) {
    dwellTimer = setInterval(() => {
      const warn = document.getElementById("dwell");
      if (!warn || !guide?.dwellAt) return;
      warn.hidden = performance.now() - guide.dwellAt < 8000;
    }, 400);
  }
}

function applySkip() {
  for (const step of SKIP_ACTIONS) caseState = act(caseState, step);
  guide.limb = null;
  noteStamps();
  fillGuide();
}


function renderExplore(main) {
  if (main.dataset.view !== "explore") {
    stopTrace();
    main.dataset.view = "explore";
    main.innerHTML = `<div class="explore-layout">
      <section class="card monitor-card">
        <div class="card-top"><p class="kicker" style="margin:0">Rhythm strip</p><span class="mono" id="ex-hr"></span></div>
        <div class="seg" id="ex-rhythms" role="group" aria-label="Rhythm"></div>
        <div id="ex-pea"></div>
        <canvas id="ex-trace" role="img" aria-label="Explore rhythm strip"></canvas>
        <p id="ex-cap" class="caption"></p>
      </section>
      <section class="card" id="ex-time"></section>
      <aside class="side-stack ex-side" id="ex-side"></aside>
      <section class="card" id="ex-flow"></section>
      <section class="card ex-wide" id="ex-causes"></section>
      <section class="card ex-wide" id="ex-about"></section>
    </div>`;
    traceCtl = mountTrace(document.getElementById("ex-trace"), () => exploreSpec());
  }
  fillExplore();
}

function exploreSpec() {
  if (explore.rhythm === "pea") return { rhythm: "pea", style: explore.peaStyle, rate: explore.peaStyle === "tachy" ? 120 : explore.peaStyle === "sine" ? 34 : 42 };
  if (explore.rhythm === "rosc") return { rhythm: "rosc", rate: 82 };
  return { rhythm: explore.rhythm };
}

function fillExplore() {
  const meta = rhythmMeta(explore.rhythm === "pea" ? "pea" : explore.rhythm, explore.peaStyle);
  document.getElementById("ex-hr").textContent = `${meta.name} · ${meta.hr}`;
  document.getElementById("ex-cap").textContent = meta.detail;
  document.getElementById("ex-trace").setAttribute("aria-label", `Synthetic ${meta.detail}`);
  document.getElementById("ex-rhythms").innerHTML = RHYTHMS.map((r) => `<button type="button" data-rhythm="${r.id}" aria-pressed="${explore.rhythm === r.id}">${esc(r.label)}</button>`).join("");
  document.getElementById("ex-pea").innerHTML = explore.rhythm === "pea"
    ? `<div class="seg" role="group" aria-label="PEA shape">${["narrow", "wide", "sine", "tachy"].map((style) => `<button type="button" data-pea="${style}" aria-pressed="${explore.peaStyle === style}">${style === "sine" ? "Sine" : style === "tachy" ? "Tachycardia" : style[0].toUpperCase() + style.slice(1)}</button>`).join("")}</div>`
    : "";
  document.getElementById("ex-time").innerHTML = timeCard();
  document.getElementById("ex-flow").innerHTML = flowCard();
  document.getElementById("ex-side").innerHTML = sideExplore();
  document.getElementById("ex-causes").innerHTML = causesCard();
  document.getElementById("ex-about").innerHTML = `<p class="kicker">About the model</p>${aboutInner()}`;
  const slider = document.getElementById("cycle");
  if (slider && document.activeElement !== slider) slider.value = String(explore.cycle);
}

function timeCard() {
  const rosc = explore.rhythm === "rosc";
  const ticks = [1, 2, 3, 4, 5, 6].map((n) => `<span class="${n === explore.cycle && !rosc ? "on" : ""}">C${n}<br>${(n - 1) * 2} min</span>`).join("");
  return `<div class="card-top"><p class="kicker" style="margin:0">Time course</p><span class="mono">${rosc ? "Immediate" : `Cycle ${explore.cycle} · ${(explore.cycle - 1) * 2} min`}</span></div>
    <div class="time-row">
      <button type="button" class="play" id="play" aria-label="${explore.playing ? "Pause the time course" : "Play the time course"}" ${rosc ? "disabled" : ""}>${explore.playing ? "Ⅱ" : "▶"}</button>
      <input id="cycle" type="range" min="1" max="6" step="1" value="${explore.cycle}" aria-label="Cycle" ${rosc ? "disabled" : ""}>
    </div>
    <div class="ticks">${ticks}</div>
    <p class="small" style="margin-top:8px">${rosc ? "Post-ROSC care is immediate. It does not wait for another cycle." : explore.rhythm === "vf" || explore.rhythm === "pvt" ? "Each step is one shock and a 2-minute cycle. Adrenaline every 3–5 minutes lands on every other cycle. Amiodarone is due with shock 3." : "Each step is a 2-minute cycle. Adrenaline is given now, then every other cycle so the gap stays inside 3–5 minutes. Do not shock. Amiodarone is not on this limb."}</p>`;
}

function flowCard() {
  const hidden = explore.predict && !explore.revealed;
  const plan = drugPlan(explore.rhythm, explore.cycle);
  if (hidden) {
    return `<p class="kicker">Algorithm</p><h2>Hidden until you commit.</h2><p class="small">The rhythm and the cycle are the question. Choose the next move, then reveal. The path lights up afterwards.</p>`;
  }
  const on = new Set(activeNodes(explore.rhythm, explore.cycle));
  const node = (id, text) => `<div class="node ${on.has(id) ? "on" : ""}">${text}</div>`;
  return `<div class="card-top"><p class="kicker" style="margin:0">Algorithm</p><span class="small">${hidden ? "Hidden until you commit" : esc(plan.next)}</span></div>
    <div class="flow">
      ${node("start", "Unresponsive, absent or abnormal breathing")}
      ${node("bystander", "Safety · call the team · CPR 30:2 · attach the defibrillator")}
      ${node("assess", "Assess the rhythm")}
      <div class="split">
        <div class="limb">
          ${node("shockable", "Shockable · VF / pulseless VT")}
          ${node("shock", "Shock")}
          ${node("cpr-s", "Immediately resume CPR for 2 min")}
          ${node("adr-s", "1st adrenaline after 3 shocks, then every 3–5 min")}
          ${node("amio", "Amiodarone after 3 shocks")}
          ${node("pads", "Consider antero-posterior pads after 3 shocks")}
        </div>
        <div class="limb">
          ${node("nonshock", "Non-shockable · PEA / asystole")}
          ${node("adr-n", "Adrenaline now, then every 3–5 min")}
          ${node("cpr-n", "Immediately resume CPR for 2 min")}
        </div>
      </div>
      ${node("causes", "Identify and treat reversible causes, early")}
      ${node("rosc", "Return of spontaneous circulation")}
      ${node("post", "ABCDE · SpO2 94–98% and normal PaCO2 · SBP &gt; 100 mmHg · 12-lead ECG · cause · temperature control")}
    </div>`;
}

function sideExplore() {
  const plan = drugPlan(explore.rhythm, explore.cycle);
  if (explore.predict && !explore.revealed) return predictCard();
  const verdict = explore.predict && explore.revealed && !explore.blind ? verdictCard(plan) : "";
  return `<section class="card">
      <div class="card-top"><p class="kicker" style="margin:0">Next</p>
        <button type="button" class="ghost" data-predict="1" aria-pressed="${explore.predict}">Predict first</button>
      </div>
      <h2>${esc(plan.next)}</h2>
      <p>${esc(plan.drugLine)}</p>
      ${plan.pads ? `<p class="small">Consider changing to antero-posterior pads. The algorithm places that after 3 shocks.</p>` : ""}
      <ul class="ref">
        <li>During CPR: optimal pad placement, oxygen, continuous compressions once a tube or SGA is in, waveform capnography, minimal pauses, early IV (IO if IV is not possible).</li>
        <li>Consider: antero-posterior pads after 3 shocks, mechanical CPR to facilitate transfer or treatment, ultrasound, extracorporeal CPR and/or coronary angiography / PCI.</li>
      </ul>
      <p class="note">${esc(DOSE_NOTE)}</p>
      ${verdict}
    </section>`;
}

function predictCard() {
  const moves = MOVES.map((m) => `<button type="button" class="choice" data-move="${m.id}" aria-pressed="${explore.move === m.id}">${esc(m.label)}</button>`).join("");
  const drugBtn = (id, label) => `<button type="button" class="choice" data-drug="${id}" aria-pressed="${id === "none" ? explore.drugs.length === 0 && explore.drugTouched : explore.drugs.includes(id)}">${label}</button>`;
  return `<section class="card">
    <div class="card-top"><p class="kicker" style="margin:0">Predict first</p>
      <button type="button" class="ghost" data-predict="1" aria-pressed="true">On</button>
    </div>
    <h2>Commit, then look.</h2>
    <p class="small">The rhythm is ${esc(explore.rhythm === "pvt" ? "pulseless VT" : explore.rhythm === "rosc" ? "a perfusing sinus rhythm" : explore.rhythm.toUpperCase())}, cycle ${explore.cycle}. What do you do?</p>
    ${moves}
    <p class="group-label">Drugs due in this cycle</p>
    <p class="small">Pick the drugs that are due, or Neither. Reveal stays shut until you do.</p>
    ${drugBtn("adrenaline", "Adrenaline")}
    ${drugBtn("amiodarone", "Amiodarone")}
    ${drugBtn("none", "Neither")}
    <div class="btn-row">
      <button type="button" class="primary" data-act="reveal" ${explore.move && explore.drugTouched ? "" : "disabled"}>Reveal</button>
      <button type="button" class="ghost" data-act="show">Show without predicting</button>
    </div>
  </section>`;
}

function verdictCard(plan) {
  const result = predictionCorrect(explore.rhythm, explore.cycle, explore.move, explore.drugs);
  const move = MOVES.find((m) => m.id === explore.move);
  return `<div class="flash ${result.moveOk && result.drugsOk ? "ok" : "bad"}" role="status">
    ${result.moveOk ? "Move correct." : `Move: the algorithm wants “${esc(MOVES.find((m) => m.id === plan.move).label)}”. You chose “${esc(move?.label || "—")}”.`}
    ${result.drugsOk ? " Drugs correct." : " Drugs do not match this cycle."}
  </div>`;
}

function causesCard() {
  const tiles = CAUSES.map((c) => `<button type="button" class="tile" data-cause-pick="${c.id}" aria-pressed="${explore.cause === c.id}"><strong>${esc(c.short)}</strong><span class="small">${esc(c.name)}</span></button>`).join("");
  const cause = CAUSES.find((c) => c.id === explore.cause) || CAUSES[0];
  return `<p class="kicker">4Hs and 4Ts</p>
    <div class="tiles">${tiles}</div>
    <div class="detail">
      <h3>${esc(cause.name)}</h3>
      <p><strong>Identify. </strong>${esc(cause.identify)}</p>
      <p><strong>Treat. </strong>${esc(cause.treat)}</p>
    </div>`;
}

function aboutView() {
  return `<section class="card"><p class="kicker">About the model</p><h1>What the simulator does, and where it stops.</h1>${aboutInner()}</section>`;
}

function aboutInner() {
  return `<div class="cols about-block">
    <div>
      <h3>What it simulates</h3>
      <p>One adult in cardiac arrest, on a clock that moves when you act. The two limbs of the RCUK 2025 Adult ALS algorithm are both here: shockable VF and pulseless VT, and non-shockable PEA and asystole. CPR is 30:2 until a tracheal tube or supraglottic airway is in, then continuous. Rhythm checks are every two minutes. Adrenaline and amiodarone follow the card. The reversible causes are the 4Hs and 4Ts printed on it. After ROSC the six immediate steps are offered, and nothing else.</p>
      <h3>How the rhythm is made</h3>
      <p>The trace is synthesised. VF is irregular noise, pulseless VT is a wide regular complex near 180 per minute, PEA is an organised rhythm (narrow, wide, sine-wave, or tachycardic), asystole is a flat line with a little noise, and ROSC is sinus. During a CPR cycle the screen shows compression artefact, because the algorithm tells you not to make a shock decision from that stretch. It is a teaching drawing, not a recording from a person.</p>
      <h3>Time and the score</h3>
      <p>You start at 100. Points come off for late or early shocks, adrenaline before the third shock or inside three minutes, amiodarone in the wrong limb or before three shocks, long pauses, and a missed drug that was due. Shocking PEA, asystole, or a perfusing rhythm fails the case outright, and so does walking away from an obvious treatable cause. Best scores stay in local storage on this device.</p>
    </div>
    <div>
      <h3>Limits</h3>
      <p>This is not a resuscitation. There is no team, no chest-wall impedance, and no real monitor artefact beyond the CPR stretch. Energy in joules, stacked shocks, and lidocaine are in the full RCUK 2025 guideline and are not on the algorithm card, so they are not simulated. The card does not print drug doses. Where a dose is shown — adrenaline 1 mg, amiodarone 300 mg after three shocks, a further 150 mg after five — it is labelled as the 2025 guideline text. The second amiodarone dose is not on the card, and omitting it is not scored as a miss. Nothing here is a prescription. Local policy decides fluids, thrombolysis, antidotes, thoracostomy, and who may do them.</p>
      <h3>Source</h3>
      <p>${esc(SOURCE)} The timing rules in the trainer are taken from that card. ${esc(DISCLAIMER)}</p>
    </div>
  </div>`;
}

function resetPrediction() {
  explore.move = null;
  explore.drugs = [];
  explore.drugTouched = false;
  explore.revealed = false;
  explore.blind = false;
}

function openCase(id) {
  if (route.view === "case" && route.id === id) {
    beginCase(id);
    const main = document.getElementById("main");
    if (main) main.dataset.view = "";
    paint();
    window.scrollTo(0, 0);
    return;
  }
  location.hash = `case/${id}`;
}

function onClick(event) {
  const el = event.target.closest("[data-act],[data-open],[data-rhythm],[data-pea],[data-move],[data-drug],[data-predict],[data-cause-pick],[data-stage]");
  if (!el || el.disabled) return;
  if (el.dataset.act === "theme") {
    const next = themeNow() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("als-theme", next);
    chrome();
    if (route.view === "case") fillGuide();
    return;
  }
  if (el.dataset.act === "clear") {
    if (confirm("Clear the saved scores on this device?")) {
      record = clearRecord();
      paint();
    }
    return;
  }
  if (el.dataset.act === "random") {
    openCase(randomCaseId(caseState?.caseId));
    return;
  }
  if (el.dataset.act === "next" && caseState) {
    openCase(nextCaseId(caseState.caseId));
    return;
  }
  if (el.dataset.open) {
    openCase(el.dataset.open);
    return;
  }
  if (el.dataset.rhythm) {
    explore.rhythm = el.dataset.rhythm;
    if (explore.predict) resetPrediction();
    fillExplore();
    return;
  }
  if (el.dataset.pea) {
    explore.peaStyle = el.dataset.pea;
    fillExplore();
    return;
  }
  if (el.dataset.predict) {
    explore.predict = !explore.predict;
    resetPrediction();
    fillExplore();
    return;
  }
  if (el.dataset.move) {
    explore.move = el.dataset.move;
    fillExplore();
    return;
  }
  if (el.dataset.drug) {
    explore.drugTouched = true;
    if (el.dataset.drug === "none") explore.drugs = [];
    else {
      const id = el.dataset.drug;
      explore.drugs = explore.drugs.includes(id) ? explore.drugs.filter((d) => d !== id) : [...explore.drugs, id];
    }
    fillExplore();
    return;
  }
  if (el.dataset.causePick) {
    explore.cause = el.dataset.causePick;
    fillExplore();
    return;
  }
  if (el.dataset.act === "reveal" || el.dataset.act === "show") {
    explore.revealed = true;
    explore.blind = el.dataset.act === "show";
    fillExplore();
    return;
  }
  if (el.id === "play" || el.dataset.act === "play") {
    togglePlay();
    return;
  }
  if (route.view === "case" && caseState && el.dataset.stage) {
    const id = el.dataset.stage;
    const status = stageStatus(caseState);
    if (caseState.ended || (status.done[id] && id !== status.current)) {
      guide.review = guide.review === id ? null : id;
      fillGuide();
    }
    return;
  }
  if (route.view === "case" && caseState && el.dataset.act) {
    const type = el.dataset.act;
    if (type === "drawer") { guide.drawer = true; fillGuide(); return; }
    if (type === "close-drawer") { guide.drawer = false; fillGuide(); return; }
    if (type === "limb-yes") { guide.limb = "shock"; guide.dwellAt = performance.now(); fillGuide(); return; }
    if (type === "limb-no") { guide.limb = "no"; guide.dwellAt = performance.now(); fillGuide(); return; }
    if (type === "limb-back") { guide.limb = null; fillGuide(); return; }
    if (type === "dismiss-finding") { guide.seenFindings = caseState.findings.length; fillGuide(); return; }
    if (type === "skip-airway") { guide.skipAirway = true; fillGuide(); return; }
    if (type === "skip-capno") { guide.skipCapno = true; fillGuide(); return; }
    if (type === "close-review") { guide.review = null; fillGuide(); return; }
    if (type === "skip-intro") { applySkip(); return; }
    if (caseState.ended) return;
    const before = caseState.log.length;
    caseState = act(caseState, { type, cause: el.dataset.cause, item: el.dataset.item });
    if (caseState.phase !== "decision") guide.limb = null;
    if (caseState.log.length !== before) guide.drawer = false;
    guide.review = null;
    noteStamps();
    fillGuide();
  }
}

function onInput(event) {
  if (event.target.id !== "cycle") return;
  explore.cycle = Number(event.target.value);
  if (explore.predict) resetPrediction();
  const label = document.querySelector("#ex-time .mono");
  if (label && explore.rhythm !== "rosc") label.textContent = `Cycle ${explore.cycle} · ${(explore.cycle - 1) * 2} min`;
  document.querySelectorAll("#ex-time .ticks span").forEach((span, index) => {
    span.classList.toggle("on", index + 1 === explore.cycle);
  });
  const flow = document.getElementById("ex-flow");
  const side = document.getElementById("ex-side");
  if (flow) flow.innerHTML = flowCard();
  if (side) side.innerHTML = sideExplore();
}

function togglePlay() {
  if (explore.rhythm === "rosc") return;
  explore.playing = !explore.playing;
  clearInterval(playTimer);
  if (explore.playing) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    playTimer = setInterval(() => {
      explore.cycle = explore.cycle >= 6 ? 1 : explore.cycle + 1;
      if (explore.predict) resetPrediction();
      const time = document.getElementById("ex-time");
      if (!time) return stopPlay();
      time.innerHTML = timeCard();
      document.getElementById("ex-flow").innerHTML = flowCard();
      document.getElementById("ex-side").innerHTML = sideExplore();
      const slider = document.getElementById("cycle");
      if (slider) slider.value = String(explore.cycle);
    }, reduce ? 1600 : 1000);
  }
  const time = document.getElementById("ex-time");
  if (time) time.innerHTML = timeCard();
}

function syncRoute() {
  route = parseHash();
  if (route.view === "case") {
    let known = true;
    try { getCase(route.id); } catch { known = false; }
    if (!known) {
      location.hash = "cases";
      return;
    }
    if (!caseState || caseState.caseId !== route.id) beginCase(route.id);
  }
  paint();
}

let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  const btn = document.getElementById("install");
  if (btn) btn.hidden = false;
});

document.getElementById("app").addEventListener("click", (event) => {
  if (event.target.closest("#install")) {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt = null;
    event.target.closest("#install").hidden = true;
    return;
  }
  if (event.target.closest("#play")) {
    togglePlay();
    return;
  }
  onClick(event);
});
document.getElementById("app").addEventListener("input", onInput);
document.getElementById("app").addEventListener("change", (event) => {
  if (event.target.dataset.act !== "skip-pref") return;
  try { localStorage.setItem("als-skip-intro", event.target.checked ? "1" : "0"); } catch { /* private mode */ }
});

let swipeY = null;
document.getElementById("app").addEventListener("pointerdown", (event) => {
  if (event.target.closest(".drawer-tab, .sheet-grab")) swipeY = event.clientY;
});
document.getElementById("app").addEventListener("pointerup", (event) => {
  if (swipeY == null || route.view !== "case" || !guide) return;
  const delta = event.clientY - swipeY;
  swipeY = null;
  if (delta < -36) guide.drawer = true;
  else if (delta > 36) guide.drawer = false;
  else return;
  fillGuide();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

shell();
window.addEventListener("hashchange", () => {
  window.scrollTo(0, 0);
  syncRoute();
});
syncRoute();
