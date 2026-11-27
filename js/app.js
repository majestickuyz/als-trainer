import { CASES, getCase, nextCaseId, randomCaseId } from "./cases.js";
import { CAUSES } from "./causes.js";
import { DOSE_NOTE, MOVES, RHYTHMS, activeNodes, drugPlan, predictionCorrect } from "./explore-model.js";
import { act, actionsFor, formatClock, pocket, readout, startCase } from "./engine.js";
import { mountTrace, rhythmMeta } from "./rhythm.js";
import { clearRecord, loadRecord, saveResult, shiftStats } from "./store.js";

const DISCLAIMER = "Educational tool, not a substitute for RCUK ALS training or local policy.";
const SOURCE = "Resuscitation Council UK 2025 Adult ALS algorithm.";

let record = loadRecord();
let route = { view: "cases" };
let caseState = null;
let traceCtl = null;
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

function paint() {
  const main = document.getElementById("main");
  chrome();
  if (route.view === "case") renderCase(main);
  else if (route.view === "explore") renderExplore(main);
  else {
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
        <p class="small">Ten patients. The cause is hidden until the debrief.</p>
        <button type="button" class="primary" data-act="random" style="margin-bottom:10px">Random case</button>
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
  if (!caseState) return;
  if (main.dataset.view !== "case") {
    stopTrace();
    stopPlay();
    main.dataset.view = "case";
    main.innerHTML = `<div class="case-layout">
      <section id="case-head" class="card"></section>
      <section class="card monitor-card">
        <div class="monitor-top"><span class="kicker" id="mon-name">Monitor</span><span class="mono" id="mon-hr"></span></div>
        <canvas id="trace" role="img" aria-label="Defibrillator monitor"></canvas>
        <p id="mon-cap" class="caption"></p>
        <div id="cycle-bar" class="cycle-bar" hidden><span id="cycle-fill"></span></div>
      </section>
      <aside id="case-side" class="case-side"></aside>
      <div id="case-under" class="case-under under-stack"></div>
    </div>`;
    traceCtl = mountTrace(document.getElementById("trace"), () => traceSpec());
  }
  if (caseState.ended && !caseState._saved) {
    caseState._saved = true;
    record = saveResult(caseState);
  }
  fillCase();
}

function traceSpec() {
  if (!caseState) return { rhythm: "none" };
  const view = readout(caseState);
  return { rhythm: view.rhythm, style: view.style, rate: view.rate };
}

function fillCase() {
  const s = caseState;
  const c = getCase(s.caseId);
  const view = readout(s);
  const meta = rhythmMeta(view.rhythm, view.style);
  const head = document.getElementById("case-head");
  const flash = s.flash ? `<div class="flash ${esc(s.flash.kind)}" role="status">${esc(s.flash.text)}</div>` : "";
  const crit = s.criticals.length && !s.ended
    ? `<div class="banner-crit">Critical error recorded. The score is a fail. Carry on if you want the debrief to show the rest.</div>`
    : "";
  head.innerHTML = `
    <div class="identity">
      <div class="clock"><strong>${esc(view.clock)}</strong><span>since collapse</span></div>
      <div>
        <p class="kicker">${esc(c.setting)}</p>
        <h1>${esc(c.title)}</h1>
        <p class="small" style="margin:0">${esc(c.complaint)}</p>
      </div>
    </div>
    <ul class="vitals">${view.vitals.map((v) => `<li>${esc(v)}</li>`).join("")}
      <li>${s.defib ? esc(view.pads) + " pads" : "Defib not attached"}</li>
      <li>Shocks ${s.shocks}</li>
      <li>${s.cprOn ? "CPR on" : "CPR off"}</li>
      <li>${s.airway ? (s.airway === "sga" ? "SGA · continuous" : "Tube · continuous") : "CPR 30:2"}</li>
    </ul>
    ${flash}${crit}`;

  document.getElementById("mon-name").textContent = s.defib ? meta.name : "No trace";
  document.getElementById("mon-hr").textContent = s.defib ? meta.hr : "";
  const cap = document.getElementById("mon-cap");
  cap.textContent = s.defib ? `${meta.detail} · ${meta.limb}` : "Attach the defibrillator to see the rhythm.";
  document.getElementById("trace").setAttribute("aria-label", s.defib ? `Monitor showing ${meta.detail}` : "Monitor blank, defibrillator not attached");
  const bar = document.getElementById("cycle-bar");
  if (view.cycleRemain == null) bar.hidden = true;
  else {
    bar.hidden = false;
    document.getElementById("cycle-fill").style.width = `${Math.min(100, ((120 - view.cycleRemain) / 120) * 100)}%`;
  }

  document.getElementById("case-side").innerHTML = s.ended ? debriefCard(s, c) : actionsCard(s);
  document.getElementById("case-under").innerHTML = underCards(s);
}

function actionsCard(s) {
  const groups = actionsFor(s).map((group) => {
    const body = group.compact ? `<div class="cause-grid">${group.rows.map((row) => actionButton(s, row)).join("")}</div>` : group.rows.map((row) => actionButton(s, row)).join("");
    return `<p class="group-label">${esc(group.title)}</p>${body}`;
  }).join("");
  return `<div class="side-stack">
    <section class="card"><p class="pocket">${esc(pocket(s))}</p></section>
    <section class="card">
      <div class="card-top"><p class="kicker" style="margin:0">Actions</p><span class="mono">${esc(formatClock(s.t))}</span></div>
      ${groups}
    </section>
  </div>`;
}

function actionButton(s, row) {
  const shockHot = row.tone === "shock" || (row.type === "shock" && s.phase === "decision" && (s.rhythm === "vf" || s.rhythm === "pvt"));
  const cls = ["action", shockHot ? "shock" : "", row.tone === "primary" || row.type === "end" ? "primary" : ""].filter(Boolean).join(" ");
  const extra = row.extra ? Object.entries(row.extra).map(([k, v]) => `data-${k}="${esc(v)}"`).join(" ") : "";
  const cost = row.type === "end" ? "score" : row.cost ? `+${row.cost}s` : "";
  return `<button type="button" class="${cls}" data-act="${esc(row.type)}" ${extra} ${row.enabled ? "" : "disabled"}>
    <span><strong>${esc(row.label)}</strong>${row.hint ? `<small>${esc(row.hint)}</small>` : ""}</span>
    <span class="cost mono">${esc(cost)}</span>
  </button>`;
}

function debriefCard(s, c) {
  const best = record.cases[c.id];
  const deductions = [
    ...s.criticals.map((item) => `<li><strong>Fail.</strong> ${esc(item.text)}</li>`),
    ...s.penalties.map((item) => `<li><span class="mono">−${item.points}</span> ${esc(item.text)}</li>`),
  ].join("");
  return `<div class="side-stack">
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
        <a class="ghost" href="#explore" style="display:inline-block">Open explore</a>
        <a class="texty" href="#cases">All cases</a>
      </div>
    </section>
    <section class="card">
      <p class="kicker">From this case</p>
      <ul class="deductions">${c.learn.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
    </section>
  </div>`;
}

function underCards(s) {
  const findings = s.findings.map((f) => `<section class="card"><p class="kicker">${esc(f.title)} · ${esc(formatClock(f.t))}</p><p style="margin:0">${esc(f.text)}</p></section>`).join("");
  const timeline = `<section class="card"><p class="kicker">Timeline</p><ol class="timeline">${s.log.map((line) => `<li><span class="when mono">${esc(formatClock(line.t))}</span><span class="${esc(line.tone)}">${esc(line.text)}</span></li>`).join("")}</ol></section>`;
  const check = s.ended
    ? `<section class="card"><p class="kicker">Against the algorithm</p><ul class="check">${s.checklist.map((row) => `<li><span>${esc(row.label)}</span><span class="mark ${row.ok ? "ok" : "no"}">${row.ok ? "Met" : "Miss"}</span></li>`).join("")}</ul></section>`
    : "";
  return findings + timeline + check;
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
    caseState = startCase(id);
    paint();
    window.scrollTo(0, 0);
    return;
  }
  location.hash = `case/${id}`;
}

function onClick(event) {
  const el = event.target.closest("[data-act],[data-open],[data-rhythm],[data-pea],[data-move],[data-drug],[data-predict],[data-cause-pick]");
  if (!el || el.disabled) return;
  if (el.dataset.act === "theme") {
    const next = themeNow() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("als-theme", next);
    chrome();
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
  if (route.view === "case" && caseState && el.dataset.act && !caseState.ended) {
    const action = { type: el.dataset.act };
    if (el.dataset.cause) action.cause = el.dataset.cause;
    if (el.dataset.item) action.item = el.dataset.item;
    caseState = act(caseState, action);
    fillCase();
    return;
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
    if (!caseState || caseState.caseId !== route.id) caseState = startCase(route.id);
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

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

shell();
window.addEventListener("hashchange", () => {
  window.scrollTo(0, 0);
  syncRoute();
});
syncRoute();
