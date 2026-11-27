import { getCase } from "./cases.js";
import { causeById } from "./causes.js";

const POST_ITEMS = ["abcde", "spo2", "paco2", "sbp", "ecg", "cause", "temp"];

export function formatClock(t) {
  const s = Math.max(0, Math.round(t));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function rhythmName(r) {
  return (
    {
      vf: "VF",
      pvt: "pulseless VT",
      pea: "PEA",
      asystole: "asystole",
      rosc: "an organised perfusing rhythm",
    }[r] || r
  );
}

function blankPost() {
  return { abcde: false, spo2: false, paco2: false, sbp: false, ecg: false, cause: false, temp: false };
}

export function startCase(caseId) {
  const c = getCase(caseId);
  const s = {
    caseId,
    t: 0,
    rhythm: c.start,
    pendingRhythm: null,
    pendingEarliest: 0,
    phase: "arrival",
    cprOn: false,
    cprEver: false,
    cprSeconds: 0,
    arrestClock: 0,
    interrupt: 0,
    timeToCpr: null,
    safety: false,
    help: false,
    oxygen: false,
    defib: false,
    pads: "al",
    access: null,
    airway: null,
    capno: false,
    mechanical: false,
    ultrasound: false,
    abg: false,
    tempChecked: false,
    ecpr: false,
    findings: [],
    shocks: 0,
    wrongShocks: 0,
    shockTimes: [],
    lastShockPads: null,
    adrenalineAt: [],
    amio: 0,
    amioAt: [],
    assessedAt: null,
    assessCount: 0,
    cycleRhythm: null,
    cycleEndsAt: null,
    cycleIndex: 0,
    cycleDrug: null,
    pauseStartedAt: null,
    confirmedRosc: false,
    roscAt: null,
    hadRosc: false,
    rearrestCount: 0,
    rearrestAt: null,
    sawShockable: c.start === "vf" || c.start === "pvt",
    sawNonShock: c.start === "pea" || c.start === "asystole",
    treatMarks: {},
    post: blankPost(),
    log: [],
    penalties: [],
    criticals: [],
    flash: null,
    ended: false,
    score: null,
    grade: null,
    headline: "",
    metrics: null,
    learn: [],
    checklist: [],
  };
  log(s, "info", `${c.title} arrives in arrest. ${c.complaint}`);
  return s;
}

export function act(prev, action) {
  if (!action || prev.ended) return prev;
  const s = structuredClone(prev);
  s.flash = null;
  const type = action.type;

  switch (type) {
    case "safety":
      return doSafety(s);
    case "help":
      return doHelp(s);
    case "cpr":
      return doCpr(s);
    case "cpr-30":
      return doCprJump(s, 30);
    case "cpr-to-check":
      return doCprToCheck(s);
    case "oxygen":
      return doOnce(s, "oxygen", "Oxygen is on.", 10, 0);
    case "defib":
      return doDefib(s);
    case "iv":
      return doAccess(s, "iv");
    case "io":
      return doAccess(s, "io");
    case "sga":
      return doAirway(s, "sga");
    case "ett":
      return doAirway(s, "ett");
    case "capno":
      return doCapno(s);
    case "assess":
      return doAssess(s);
    case "shock":
      return doShock(s);
    case "adrenaline":
      return doAdrenaline(s);
    case "amiodarone":
      return doAmiodarone(s);
    case "pulse":
      return doPulse(s);
    case "pads":
      return doPads(s);
    case "mechanical":
      return doConsider(s, "mechanical", "Mechanical chest compressions, to facilitate transfer or treatment.", 40, 10);
    case "ultrasound":
      return doInvest(s, "ultrasound", "Ultrasound", "ultrasound");
    case "abg":
      return doInvest(s, "abg", "Blood gas", "abg");
    case "temp":
      return doInvest(s, "tempChecked", "Temperature", "temp");
    case "ecpr":
      return doEcpr(s);
    case "treat":
      return doTreat(s, action.cause);
    case "post":
      return doPost(s, action.item);
    case "end":
      return finalise(s);
    default:
      s.flash = { kind: "warn", text: "That action is not on the algorithm." };
      return s;
  }
}

export function isAdrenalineDue(s) {
  if (s.confirmedRosc || s.phase === "rosc") return false;
  if (s.assessCount === 0) return false;
  const r = s.cycleRhythm || s.rhythm;
  if (!r || r === "rosc") return false;
  const last = s.adrenalineAt.length ? s.adrenalineAt[s.adrenalineAt.length - 1] : null;
  if (last != null && s.t - last < 180) return false;
  if (r === "vf" || r === "pvt") {
    if (s.adrenalineAt.length === 0) return s.shocks >= 3;
    return true;
  }
  if (r === "pea" || r === "asystole") return true;
  return false;
}

export function isAmioDue(s) {
  if (s.assessCount === 0 || s.confirmedRosc || s.phase === "rosc") return false;
  const r = s.cycleRhythm || s.rhythm;
  if (r !== "vf" && r !== "pvt") return false;
  return s.shocks >= 3 && s.amio === 0;
}

export function adrenalineHint(s) {
  if (s.assessCount === 0) return "Assess the rhythm first. The limb decides the timing.";
  if (!s.access) return "Needs IV access, or IO if IV is not possible.";
  if (s.confirmedRosc || (s.cycleRhythm || s.rhythm) === "rosc") {
    return "Not an arrest bolus once there is a pulse. Support the blood pressure after ROSC.";
  }
  const r = s.cycleRhythm || s.rhythm;
  const last = s.adrenalineAt.length ? s.adrenalineAt[s.adrenalineAt.length - 1] : null;
  if (last != null && s.t - last < 180) {
    const wait = Math.ceil(180 - (s.t - last));
    return `Last dose ${formatClock(s.t - last)} ago. The interval is 3–5 min (${wait}s to go).`;
  }
  if ((r === "vf" || r === "pvt") && s.adrenalineAt.length === 0 && s.shocks < 3) {
    return `Shockable rhythm: first adrenaline after 3 shocks (${s.shocks} so far).`;
  }
  if (isAdrenalineDue(s)) {
    return s.adrenalineAt.length === 0
      ? r === "pea" || r === "asystole"
        ? "Due now. Non-shockable: give it as soon as there is access. Dose in the RCUK 2025 guideline text: 1 mg."
        : "Due now, after 3 shocks. Dose in the RCUK 2025 guideline text: 1 mg."
      : "Due now. Repeat every 3–5 minutes. Guideline dose: 1 mg.";
  }
  return "Not due.";
}

export function amioHint(s) {
  if (!s.access) return "Needs IV or IO access.";
  if (s.assessCount === 0) return "Assess the rhythm first.";
  const r = s.cycleRhythm || s.rhythm;
  if (s.confirmedRosc || r === "rosc") return "Not a post-ROSC drug on this algorithm.";
  if (r !== "vf" && r !== "pvt") return "Shockable limb only. Not for PEA or asystole.";
  if (s.amio === 0 && s.shocks < 3) return `After 3 shocks (${s.shocks} so far). Guideline dose: 300 mg.`;
  if (s.amio === 0) return "Due after 3 shocks. Guideline dose: 300 mg.";
  if (s.amio === 1 && s.shocks < 5) {
    return "First dose given. The full guideline describes a further 150 mg after 5 shocks. The card does not. Giving it early is scored against you; omitting it is not.";
  }
  if (s.amio === 1) return "Further 150 mg is in the RCUK 2025 guideline text after 5 shocks. Not printed on the card. Omitting it is not a miss.";
  return "Both guideline doses given.";
}

function doSafety(s) {
  if (s.safety) return block(s, "Scene safety is already confirmed.");
  s.safety = true;
  advance(s, 5, 0);
  log(s, "good", "Scene safe. Personal safety sits at the top of the algorithm.");
  return s;
}

function doHelp(s) {
  if (s.help) return block(s, "The resuscitation team has already been called.");
  s.help = true;
  advance(s, 10, 0);
  log(s, "good", "Resuscitation team called.");
  return s;
}

function doOnce(s, key, message, dt, pause) {
  if (s[key]) return block(s, "Already done.");
  s[key] = true;
  advance(s, dt, s.cprOn ? pause : 0);
  log(s, "good", message);
  return s;
}

function doDefib(s) {
  if (s.defib) return block(s, "The defibrillator is already attached.");
  s.defib = true;
  advance(s, 20, s.cprOn ? 5 : 0);
  log(
    s,
    "good",
    "Defibrillator on. Pads antero-lateral. The algorithm asks for optimal pad placement. RCUK 2025 guideline text: put the lateral pad below the armpit, in the mid-axillary line.",
  );
  return s;
}

function doAccess(s, route) {
  if (s.access) return block(s, `Access is already ${s.access === "iv" ? "intravenous" : "intraosseous"}.`);
  s.access = route;
  const dt = route === "iv" ? 45 : 30;
  advance(s, dt, 0);
  if (route === "iv") log(s, "good", "IV access. Early vascular access is on the algorithm.");
  else {
    log(s, "info", "IO access. The algorithm says IO if IV is not possible.");
  }
  return s;
}

function doAirway(s, kind) {
  if (s.airway === kind) return block(s, "That airway is already in.");
  s.airway = kind;
  if (kind === "sga") {
    advance(s, 20, s.cprOn ? 5 : 0);
    log(s, "good", "Supraglottic airway placed. Compressions can be continuous. Add waveform capnography.");
  } else {
    advance(s, 30, s.cprOn ? 8 : 0);
    log(s, "good", "Tracheal tube placed. Compressions can be continuous. Add waveform capnography.");
  }
  return s;
}

function doCapno(s) {
  if (!s.airway) return block(s, "Waveform capnography needs a tracheal tube or a supraglottic airway.");
  if (s.capno) return block(s, "Waveform capnography is already running.");
  s.capno = true;
  advance(s, 15, 0);
  log(s, "good", `Waveform capnography on. End-tidal CO2 is ${etco2(s)}.`);
  return s;
}

function doCpr(s) {
  if (s.phase === "rosc" && s.confirmedRosc) {
    return block(s, "There is a pulse. Post-ROSC care now, not another cycle of CPR, unless the patient re-arrests.");
  }
  if (s.cprOn && s.phase === "cpr") return block(s, "CPR is already in progress.");
  const fromDecision = s.phase === "decision" || s.phase === "postshock";
  const down = !s.cprOn && s.pauseStartedAt != null ? s.t - s.pauseStartedAt : 0;
  if (s.phase === "postshock" && down > 15) {
    penalise(s, `slow-resume-${s.shocks}`, 8, "CPR was not restarted straight after the shock.");
  }
  advance(s, 5, s.cprOn ? 0 : 5);
  s.cprOn = true;
  if (!s.cprEver) {
    s.cprEver = true;
    s.timeToCpr = s.t;
    if (s.t > 25) penalise(s, "slow-cpr", 8, "CPR was not started promptly.");
  }
  s.pauseStartedAt = null;
  if (fromDecision) {
    s.phase = "cpr";
    s.cycleEndsAt = s.t + 120;
    s.cycleIndex += 1;
    s.cycleDrug = {
      adrenalineDue: isAdrenalineDue(s),
      amioDue: isAmioDue(s),
      adrenalineCount: s.adrenalineAt.length,
      amio: s.amio,
      hadAccess: !!s.access,
    };
    const mode = s.airway ? "continuous compressions (tube or SGA in place)" : "30:2";
    log(s, "good", `CPR resumed for 2 minutes, ${mode}. Reassess at ${formatClock(s.cycleEndsAt)}.`);
  } else if (s.phase === "rosc") {
    log(s, "info", "Compressions restarted.");
    s.phase = "cpr";
    s.cycleEndsAt = s.t + 120;
    s.cycleIndex += 1;
    s.confirmedRosc = false;
  } else {
    const mode = s.airway ? "continuous compressions" : "30:2";
    log(s, "good", `CPR started, ${mode}.`);
  }
  return s;
}

function doCprJump(s, seconds) {
  if (s.phase !== "cpr" || !s.cprOn) return block(s, "Start a 2-minute cycle of CPR first.");
  if (s.cycleEndsAt == null) return block(s, "No cycle is running.");
  const remain = Math.max(0, s.cycleEndsAt - s.t);
  if (remain <= 0) return block(s, "Two minutes are up. Assess the rhythm.");
  const jump = Math.min(seconds, remain);
  advance(s, jump, 0);
  if (s.t >= s.cycleEndsAt) {
    log(s, "info", "Two minutes of CPR. Assess the rhythm.");
    s.flash = { kind: "info", text: "Two minutes. Assess the rhythm." };
  } else {
    log(s, "info", `CPR continues. ${Math.ceil(s.cycleEndsAt - s.t)} s to the rhythm check.`);
  }
  return s;
}

function doCprToCheck(s) {
  if (s.phase !== "cpr" || !s.cprOn || s.cycleEndsAt == null) {
    return block(s, "There is no 2-minute cycle running.");
  }
  const remain = Math.max(0, s.cycleEndsAt - s.t);
  if (remain <= 0) return block(s, "Two minutes are up. Assess the rhythm.");
  advance(s, remain, 0);
  log(s, "info", "Two minutes of CPR. Assess the rhythm.");
  s.flash = { kind: "info", text: "Two minutes. Assess the rhythm." };
  return s;
}

function doAssess(s) {
  if (!s.defib) return block(s, "Attach the defibrillator before you assess the rhythm.");
  if (s.phase === "postshock") {
    return block(s, "Resume CPR for 2 minutes before the next rhythm check. Do not pause to look straight after a shock.");
  }
  if (s.phase === "cpr" && s.cycleEndsAt != null && s.cycleEndsAt - s.t > 20) {
    penalise(
      s,
      `early-rhythm-${s.cycleIndex}`,
      4,
      "The rhythm was checked before the 2-minute cycle had finished.",
    );
  }
  settleCycleDrugs(s);
  s.cprOn = false;
  s.pauseStartedAt = s.t;
  advance(s, 5, 5);
  if (s.pendingRhythm && s.t >= (s.pendingEarliest ?? 0)) {
    const prev = s.rhythm;
    s.rhythm = s.pendingRhythm;
    s.pendingRhythm = null;
    if (prev !== s.rhythm) {
      log(s, "info", `Rhythm now ${rhythmName(s.rhythm)}.`);
    }
  }
  s.assessCount += 1;
  s.assessedAt = s.t;
  s.cycleRhythm = s.rhythm;
  s.phase = "decision";
  noteLimb(s, s.rhythm);
  const name = rhythmName(s.rhythm);
  if (s.rhythm === "vf" || s.rhythm === "pvt") {
    log(s, "info", `Rhythm check: ${name}. Shockable. Deliver one shock, then restart CPR.`);
    s.flash = { kind: "info", text: `${s.rhythm === "vf" ? "VF" : "Pulseless VT"}. Shockable.` };
  } else if (s.rhythm === "rosc") {
    log(s, "info", "Rhythm check: organised and looks perfusing. Check for a pulse.");
    s.flash = { kind: "ok", text: "Organised rhythm. Check the pulse." };
  } else {
    log(s, "info", `Rhythm check: ${name}. Non-shockable. Do not shock.`);
    s.flash = { kind: "info", text: `${s.rhythm === "pea" ? "PEA" : "Asystole"}. Do not shock.` };
  }
  return s;
}

function doShock(s) {
  if (!s.defib) return block(s, "Attach the defibrillator first.");
  if (s.phase !== "decision") {
    return block(s, "Assess the rhythm, with a pause, before you shock. The trace during CPR is not a decision.");
  }
  const r = s.rhythm;
  if (r === "pea" || r === "asystole" || r === "rosc") {
    critical(
      s,
      "shock-nonshockable",
      `Shock delivered to ${rhythmName(r)}. That rhythm is not shockable. The score is a fail.`,
    );
    s.wrongShocks += 1;
    advance(s, 5, 5);
    s.phase = "postshock";
    s.pauseStartedAt = s.t;
    return s;
  }
  if ((r === "vf" || r === "pvt") && s.assessedAt != null && s.t - s.assessedAt > 20) {
    const over = s.t - s.assessedAt - 20;
    const pts = Math.min(12, 4 + Math.floor(over / 15) * 2);
    penalise(s, `shock-delay-${s.shocks}`, pts, "The shock was delayed after a shockable rhythm was confirmed.");
  }
  s.shocks += 1;
  s.lastShockPads = s.pads;
  advance(s, 5, 5);
  s.shockTimes.push(s.t);
  s.phase = "postshock";
  s.pauseStartedAt = s.t;
  const where = s.pads === "ap" ? "antero-posterior pads" : "antero-lateral pads";
  log(s, "good", `Shock ${s.shocks} delivered (${where}). Resume CPR immediately.`);
  s.flash = { kind: "info", text: `Shock ${s.shocks}. Restart CPR now.` };
  return s;
}

function doAdrenaline(s) {
  if (!s.access) {
    return block(s, "No IV or IO access. The algorithm asks for early IV access, and IO if IV is not possible.");
  }
  if (s.assessCount === 0) return block(s, "Assess the rhythm before adrenaline. The limb decides when it is due.");
  const r = s.cycleRhythm || s.rhythm;
  if (s.confirmedRosc || r === "rosc") {
    return block(s, "There is a pulse, or the trace looks perfusing. Adrenaline 1 mg is an arrest bolus, not the post-ROSC step.");
  }
  const last = s.adrenalineAt.length ? s.adrenalineAt[s.adrenalineAt.length - 1] : null;
  const before = s.penalties.length;
  if ((r === "vf" || r === "pvt") && s.adrenalineAt.length === 0 && s.shocks < 3) {
    penalise(s, "early-adr", 15, "Adrenaline was given in a shockable rhythm before the third shock.");
  } else if (last != null && s.t - last < 180) {
    penalise(s, `adr-interval-${s.adrenalineAt.length}`, 12, "Adrenaline was repeated before 3 minutes.");
  }
  s.adrenalineAt.push(s.t);
  advance(s, 10, 0);
  const tone = s.penalties.length > before ? "bad" : "good";
  log(
    s,
    tone,
    `Adrenaline 1 mg given (${s.adrenalineAt.length === 1 ? "first dose" : "repeat"}). The 1 mg dose is from the RCUK 2025 guideline text. The card states the timing.`,
  );
  return s;
}

function doAmiodarone(s) {
  if (!s.access) return block(s, "No IV or IO access.");
  if (s.assessCount === 0) return block(s, "Assess the rhythm first.");
  const r = s.cycleRhythm || s.rhythm;
  if (s.confirmedRosc || r === "rosc") {
    return block(s, "Amiodarone on this algorithm is for shockable arrest after 3 shocks, not for after ROSC.");
  }
  if (s.amio >= 2) return block(s, "Both guideline doses have already been given.");
  advance(s, 10, 0);
  if (r !== "vf" && r !== "pvt") {
    penalise(
      s,
      `amio-wrong-${s.amioAt.length}`,
      15,
      "Amiodarone given in a non-shockable rhythm. The algorithm gives it after 3 shocks, for VF or pulseless VT.",
    );
    log(s, "bad", "Amiodarone given off the algorithm. Non-shockable limb: adrenaline, not amiodarone.");
    return s;
  }
  if (s.amio === 0 && s.shocks >= 3) {
    s.amio = 1;
    s.amioAt.push(s.t);
    log(s, "good", "Amiodarone 300 mg after 3 shocks. Dose from the RCUK 2025 guideline text; the card states the timing.");
    return s;
  }
  if (s.amio === 0 && s.shocks < 3) {
    s.amio = 1;
    s.amioAt.push(s.t);
    penalise(s, "amio-early", 12, "Amiodarone was given before 3 shocks.");
    log(s, "bad", "Amiodarone given before 3 shocks.");
    return s;
  }
  if (s.amio === 1 && s.shocks >= 5) {
    s.amio = 2;
    s.amioAt.push(s.t);
    log(
      s,
      "good",
      "Further amiodarone 150 mg. This second dose is in the RCUK 2025 guideline text after five shocks. It is not printed on the algorithm card, and omitting it is not scored as a miss.",
    );
    return s;
  }
  s.amio = 2;
  s.amioAt.push(s.t);
  penalise(
    s,
    "amio-second-early",
    4,
    "A further amiodarone dose is described after 5 shocks in the full guideline, not before.",
  );
  log(s, "bad", "Further amiodarone given before 5 shocks.");
  return s;
}

function doPulse(s) {
  if (!s.defib && s.assessCount === 0) return block(s, "Attach the defibrillator and look at the rhythm first.");
  const organised = s.phase !== "cpr" && (s.rhythm === "rosc" || s.rhythm === "pea");
  advance(s, 10, organised ? 0 : 10);
  s.cprOn = false;
  s.pauseStartedAt = s.t;
  const r = s.phase === "cpr" ? null : s.rhythm;
  if (s.phase === "cpr") {
    penalise(s, `pulse-cpr-${s.log.length}`, 5, "A pulse check during the CPR cycle added a pause. Reassess at 2 minutes.");
    log(s, "bad", "Pulse check during CPR. No reliable pulse, and the pause was wasted.");
    s.phase = "decision";
    return s;
  }
  if (r === "rosc") {
    s.confirmedRosc = true;
    s.hadRosc = true;
    s.roscAt = s.t;
    s.phase = "rosc";
    s.cprOn = false;
    log(s, "good", "Pulse present. ROSC. Move straight to the post-ROSC steps on the algorithm.");
    s.flash = { kind: "ok", text: "ROSC. ABCDE, oxygen targets, blood pressure, 12-lead, the cause, temperature." };
    return s;
  }
  if (r === "pea") {
    log(s, "info", "No pulse. This organised rhythm is PEA. Resume CPR. Adrenaline if it is due.");
    s.flash = { kind: "info", text: "No pulse. PEA." };
    s.phase = "decision";
    return s;
  }
  penalise(s, `pulse-useless-${s.assessCount}-${s.shocks}`, 4, "Pulse check on a non-organised rhythm. It only adds a pause.");
  log(s, "bad", `No pulse, as expected in ${rhythmName(r)}. The check added a pause.`);
  s.phase = "decision";
  return s;
}

function doPads(s) {
  if (!s.defib) return block(s, "Attach the defibrillator before you move the pads.");
  if (s.pads === "ap") return block(s, "Pads are already antero-posterior.");
  s.pads = "ap";
  advance(s, 25, s.cprOn ? 10 : 0);
  const early = s.shocks < 3;
  log(
    s,
    "info",
    early
      ? "Pads moved to antero-posterior before 3 shocks. The algorithm says to consider that change after 3 shocks."
      : "Pads moved to antero-posterior. The algorithm says to consider this after 3 shocks in refractory VF/pVT.",
  );
  return s;
}

function doConsider(s, key, message, dt, pause) {
  if (s[key]) return block(s, "Already done.");
  s[key] = true;
  advance(s, dt, s.cprOn ? pause : 0);
  log(s, "info", message);
  return s;
}

function doInvest(s, flag, title, field) {
  const c = getCase(s.caseId);
  if (s[flag]) return block(s, `${title} already obtained.`);
  s[flag] = true;
  const text = c[field];
  const dt = field === "temp" ? 15 : field === "abg" ? 45 : 30;
  advance(s, dt, s.cprOn && field === "ultrasound" ? 5 : 0);
  s.findings.push({ t: s.t, title, text });
  log(s, "info", `${title}: ${text}`);
  return s;
}

function doEcpr(s) {
  if (s.ecpr) return block(s, "Already considered.");
  s.ecpr = true;
  advance(s, 20, 0);
  const c = getCase(s.caseId);
  log(s, "info", "Considered extracorporeal CPR and/or coronary angiography and PCI.");
  if (c.cause === "thrombosis-coronary" && !s.treatMarks["thrombosis-coronary"]) {
    s.treatMarks["thrombosis-coronary"] = { t: s.t, shocks: s.shocks };
    log(s, "good", "Coronary thrombosis is being treated via the angiography / eCPR pathway.");
  }
  syncRhythm(s);
  return s;
}

function doTreat(s, cause) {
  const meta = causeById(cause);
  if (!meta) return block(s, "That is not a reversible cause on the algorithm.");
  if (s.treatMarks[cause]) return block(s, `${meta.short} has already been treated.`);
  s.treatMarks[cause] = { t: s.t, shocks: s.shocks };
  advance(s, 30, 0);
  log(s, "info", `Treating ${meta.name}.`);
  const c = getCase(s.caseId);
  if (cause === c.cause || (c.cause === "pads" && false)) {
    log(s, "good", `Reversible cause addressed: ${meta.name}.`);
  }
  return s;
}

function doPost(s, item) {
  if (!POST_ITEMS.includes(item)) return block(s, "That post-ROSC step is not on the algorithm.");
  if (s.phase !== "rosc" || !s.confirmedRosc) {
    return block(s, "Those steps are for immediately after ROSC, once a pulse is confirmed.");
  }
  if (s.post[item]) return block(s, "Already done.");
  s.post[item] = true;
  const labels = {
    abcde: "ABCDE assessment started.",
    spo2: "Oxygen titrated. Aim SpO2 94–98%.",
    paco2: "Ventilation aimed at a normal PaCO2.",
    sbp: "Blood pressure supported. Aim SBP above 100 mmHg. The algorithm does not give a vasopressor dose.",
    ecg: "12-lead ECG recorded.",
    cause: "Cause identified and treatment continued after ROSC.",
    temp: "Temperature control started.",
  };
  advance(s, 20, 0);
  log(s, "good", labels[item]);
  return s;
}

function settleCycleDrugs(s) {
  if (!s.cycleDrug || s.phase !== "cpr") return;
  const snap = s.cycleDrug;
  s.cycleDrug = null;
  if (snap.adrenalineDue && s.adrenalineAt.length === snap.adrenalineCount && (snap.hadAccess || s.access)) {
    penalise(s, `missed-adr-${s.cycleIndex}`, 8, "Adrenaline was due in that 2-minute cycle and was not given.");
  }
  if (snap.amioDue && s.amio === snap.amio && (snap.hadAccess || s.access)) {
    penalise(s, `missed-amio-${s.cycleIndex}`, 10, "Amiodarone was due after 3 shocks and was not given in that cycle.");
  }
}

function noteLimb(s, r) {
  if (r === "vf" || r === "pvt") s.sawShockable = true;
  if (r === "pea" || r === "asystole") s.sawNonShock = true;
}

function advance(s, dt, pauseSeconds) {
  const paused = Math.min(Math.max(0, pauseSeconds || 0), dt);
  s.t += dt;
  const inArrest = !(s.phase === "rosc" && s.confirmedRosc);
  if (inArrest) {
    s.arrestClock += dt;
    s.interrupt += paused;
    if (s.cprOn) s.cprSeconds += dt - paused;
  }
  syncRhythm(s);
  if (s.phase === "cpr" && s.cycleEndsAt != null && s.t > s.cycleEndsAt + 25) {
    penalise(s, `late-rhythm-${s.cycleIndex}`, 6, "The rhythm was not reassessed when the 2 minutes were up.");
  }
}

function syncRhythm(s) {
  const desired = getCase(s.caseId).evolve(s);
  if (!desired) return;
  if (desired.rearrest && s.phase === "rosc") {
    s.rhythm = desired.rhythm;
    s.pendingRhythm = null;
    s.phase = "decision";
    s.cprOn = false;
    s.confirmedRosc = false;
    s.rearrestCount += 1;
    s.rearrestAt = s.t;
    s.cycleRhythm = desired.rhythm;
    s.pauseStartedAt = s.t;
    noteLimb(s, desired.rhythm);
    log(s, "bad", `Re-arrest. The monitor shows ${rhythmName(desired.rhythm)}. Back into the algorithm.`);
    s.flash = { kind: "bad", text: "Re-arrest. The pulse has gone." };
    return;
  }
  if (desired.rhythm === s.rhythm) {
    if (s.pendingRhythm && s.pendingRhythm !== desired.rhythm) s.pendingRhythm = null;
    return;
  }
  if (s.pendingRhythm === desired.rhythm) return;
  s.pendingRhythm = desired.rhythm;
  if (desired.rhythm === "rosc" && s.cycleEndsAt != null && s.t < s.cycleEndsAt) {
    s.pendingEarliest = s.cycleEndsAt;
  } else {
    s.pendingEarliest = s.t;
  }
}

function penalise(s, key, points, text) {
  if (s.penalties.some((p) => p.key === key)) return;
  s.penalties.push({ key, points, text });
}

function critical(s, key, text) {
  if (s.criticals.some((c) => c.key === key)) return;
  s.criticals.push({ key, text });
  s.flash = { kind: "bad", text };
  log(s, "crit", text);
}

function block(s, text) {
  s.flash = { kind: "warn", text };
  return s;
}

function log(s, tone, text) {
  s.log.push({ t: s.t, tone, text });
}

export function etco2(s) {
  if (!s.capno || !s.airway) return null;
  if (s.confirmedRosc && s.phase === "rosc") return "5.4 kPa";
  if (s.caseId === "hypoxia" && !s.confirmedRosc) return "0.7 kPa";
  if (!s.confirmedRosc) return "1.6 kPa";
  return "4.8 kPa";
}

export function readout(s) {
  const c = getCase(s.caseId);
  let rhythm = s.rhythm;
  let style = c.style;
  let rate = c.rate;
  if (!s.defib) rhythm = "none";
  else if (s.phase === "cpr") rhythm = "artefact";
  else if (rhythm === "rosc") {
    style = "narrow";
    rate = 82;
  } else if (rhythm !== "pea") {
    style = rhythm === "pvt" ? "wide" : style;
  }
  const vitals = [];
  if (s.confirmedRosc && s.phase === "rosc") {
    vitals.push("Pulse present");
    vitals.push(s.post.sbp ? "SBP 112 mmHg" : "SBP 82 mmHg");
    vitals.push(s.post.spo2 ? "SpO2 96%" : s.oxygen ? "SpO2 100% on high-flow oxygen" : "SpO2 not measured");
    vitals.push(s.post.paco2 ? "PaCO2 targeted to normal" : "PaCO2 not yet targeted");
  } else {
    vitals.push("No palpable pulse");
    vitals.push(s.oxygen ? "Oxygen on" : "Oxygen off");
  }
  if (s.capno && s.airway) vitals.push(`EtCO2 ${etco2(s)}`);
  const pad = s.pads === "ap" ? "antero-posterior" : "antero-lateral";
  return {
    rhythm,
    style,
    rate,
    clock: formatClock(s.t),
    vitals,
    pads: s.defib ? pad : "not attached",
    shocks: s.shocks,
    cpr: s.cprOn,
    cycleRemain: s.phase === "cpr" && s.cycleEndsAt != null ? Math.max(0, s.cycleEndsAt - s.t) : null,
  };
}

export function finalise(prev) {
  const s = prev.ended ? prev : structuredClone(prev);
  if (s.ended) return s;
  settleCycleDrugs(s);
  const c = getCase(s.caseId);

  if (!s.safety) penalise(s, "no-safety", 3, "Scene safety was not confirmed.");
  if (!s.help) penalise(s, "no-help", 6, "The resuscitation team was not called.");
  if (!s.cprEver) penalise(s, "no-cpr", 18, "CPR was never started.");
  if (!s.oxygen) penalise(s, "no-oxygen", 5, "Oxygen was not given.");
  if (!s.defib) penalise(s, "no-defib", 8, "The defibrillator was not attached.");
  if (!s.access && s.t > 90) penalise(s, "no-access", 6, "No IV or IO access, so drugs could not be given safely.");
  if (s.airway && !s.capno) {
    penalise(s, "no-capno", 4, "A tracheal tube or SGA was placed without waveform capnography.");
  }
  if (s.cprEver && s.arrestClock > 90) {
    const frac = s.cprSeconds / s.arrestClock;
    if (frac < 0.5) {
      penalise(
        s,
        "cpr-fraction",
        8,
        `Chest compressions were in progress for only ${Math.round(frac * 100)}% of the arrest.`,
      );
    }
  }
  if (s.arrestClock > 120 && s.interrupt / Math.max(1, s.arrestClock) > 0.22) {
    penalise(s, "interruptions", 6, "Pauses in chest compressions added up. The algorithm says to minimise them.");
  }
  if ((c.start === "vf" || c.start === "pvt") && s.shocks === 0 && s.wrongShocks === 0 && s.defib) {
    penalise(s, "no-shock", 12, "A shockable starting rhythm was never shocked.");
  }
  if (
    s.sawNonShock &&
    s.adrenalineAt.length === 0 &&
    s.access &&
    s.t > 70 &&
    !s.hadRosc &&
    !s.penalties.some((p) => p.key.startsWith("missed-adr"))
  ) {
    penalise(s, "missed-first-adr", 10, "Non-shockable rhythm: adrenaline was never given.");
  }
  if (
    s.sawShockable &&
    s.shocks >= 3 &&
    s.amio === 0 &&
    s.access &&
    !s.hadRosc &&
    !s.penalties.some((p) => p.key.startsWith("missed-amio"))
  ) {
    penalise(s, "missed-amio-end", 10, "Amiodarone was still outstanding after 3 shocks.");
  }

  if (c.critical === "pads") {
    if (!s.confirmedRosc && !(s.pads === "ap" && s.shocks >= 4)) {
      critical(
        s,
        "missed-pads",
        "Refractory VF: after 3 shocks the algorithm says to consider antero-posterior pads. The rhythm did not convert without that change.",
      );
    }
  } else if (!s.treatMarks[c.cause] && !s.confirmedRosc) {
    critical(s, "missed-cause", `Missed a treatable cause: ${c.causeLabel}.`);
  } else if (!s.confirmedRosc && s.criticals.length === 0) {
    penalise(s, "no-rosc", 8, "The case ended without ROSC.");
  }

  if (s.confirmedRosc || s.hadRosc) {
    const missing = POST_ITEMS.filter((item) => !s.post[item]);
    if (missing.length) {
      penalise(
        s,
        "post-gap",
        Math.min(24, missing.length * 4),
        `Post-ROSC steps still open: ${missing.map(postLabel).join(", ")}.`,
      );
    }
  }

  if (c.id === "hypoxia" && s.treatMarks.hypoxia && !(s.oxygen && s.airway)) {
    penalise(
      s,
      "hypoxia-incomplete",
      8,
      "Hypoxia was selected, but oxygen and a tracheal tube or SGA were still missing.",
    );
  }

  const lost = s.penalties.reduce((sum, p) => sum + p.points, 0);
  s.score = s.criticals.length ? 0 : Math.max(0, 100 - lost);
  if (s.criticals.length) s.grade = "Fail";
  else if (s.score >= 80) s.grade = "Pass";
  else if (s.score >= 60) s.grade = "Borderline";
  else s.grade = "Fail";

  s.headline = headlineFor(s, c);
  s.metrics = metricsFor(s);
  s.checklist = checklistFor(s, c);
  s.learn = learnFor(s, c);
  s.ended = true;
  log(s, "info", `Case closed. ${s.grade}, ${s.score}/100.`);
  return s;
}

function postLabel(item) {
  return (
    {
      abcde: "ABCDE",
      spo2: "SpO2 94–98%",
      paco2: "normal PaCO2",
      sbp: "SBP > 100 mmHg",
      ecg: "12-lead ECG",
      cause: "identify and treat the cause",
      temp: "temperature control",
    }[item] || item
  );
}

function headlineFor(s, c) {
  if (s.criticals.some((x) => x.key === "shock-nonshockable")) {
    return "Critical error — a non-shockable rhythm was shocked";
  }
  if (s.criticals.some((x) => x.key === "missed-cause" || x.key === "missed-pads")) {
    return "Critical miss — the treatable problem was still there";
  }
  if (s.hadRosc && s.grade === "Pass") return "ROSC, and the algorithm was followed";
  if (s.hadRosc && s.grade === "Borderline") return "ROSC, with gaps in the algorithm";
  if (s.hadRosc) return "ROSC, but the score does not hold";
  return `No ROSC — ${c.causeLabel} was the hinge`;
}

function metricsFor(s) {
  const frac = s.arrestClock > 0 ? Math.round((s.cprSeconds / s.arrestClock) * 100) : 0;
  return [
    ["Time to CPR", s.timeToCpr == null ? "—" : formatClock(s.timeToCpr)],
    ["Time to first correct shock", s.shockTimes[0] == null ? "—" : formatClock(s.shockTimes[0])],
    ["Shocks", String(s.shocks)],
    ["First adrenaline", s.adrenalineAt[0] == null ? "—" : formatClock(s.adrenalineAt[0])],
    ["Amiodarone", s.amioAt[0] == null ? "—" : formatClock(s.amioAt[0])],
    ["CPR fraction", s.arrestClock > 0 ? `${frac}%` : "—"],
    ["ROSC", s.hadRosc ? formatClock(s.roscAt) : "No"],
  ];
}

function checklistFor(s, c) {
  const rows = [
    ["Scene safe", s.safety],
    ["Help called", s.help],
    ["CPR 30:2, then continuous if a tube or SGA is in", s.cprEver],
    ["Defibrillator attached", s.defib],
    ["Oxygen", s.oxygen],
    ["IV or IO access", !!s.access],
    ["Rhythm assessed", s.assessCount > 0],
    ["Shocks only for VF / pulseless VT", s.wrongShocks === 0],
    ["Adrenaline on the algorithm’s clock", !s.penalties.some((p) => p.key.includes("adr") || p.key.includes("early-adr"))],
    ["Amiodarone only after 3 shocks, and only if shockable", s.amio === 0 || (s.shockTimes.length >= 1 && !s.penalties.some((p) => p.key.startsWith("amio")))],
  ];
  if (c.critical === "pads") {
    rows.push(["Antero-posterior pads after refractory shocks", s.pads === "ap" && s.shocks >= 4]);
  } else {
    rows.push([`Reversible cause treated (${c.causeLabel})`, !!s.treatMarks[c.cause]]);
  }
  rows.push(["Waveform capnography if a tube or SGA was used", !s.airway || s.capno]);
  if (s.hadRosc) rows.push(["Immediate post-ROSC bundle", POST_ITEMS.every((item) => s.post[item])]);
  return rows.map(([label, ok]) => ({ label, ok }));
}

function learnFor(s, c) {
  const lines = [];
  for (const item of s.criticals) lines.push(item.text);
  for (const item of s.penalties) lines.push(item.text);
  if (lines.length === 0) lines.push("Nothing on the scorecard to give back. The timing and the limb both held.");
  for (const line of c.learn) lines.push(line);
  lines.push(c.truth);
  return lines;
}

function urgentAction(s) {
  if (s.phase === "postshock") return row("cpr", "Resume CPR now", 5, true, "Immediately after the shock.", "primary");
  if (s.phase === "decision" && (s.rhythm === "vf" || s.rhythm === "pvt")) {
    return row("shock", "Shock", 5, true, "One shock, then restart CPR.", "shock");
  }
  if (s.phase === "decision" && s.rhythm === "rosc") return row("pulse", "Check for a pulse", 10, true, "Confirm ROSC before the post-ROSC steps.", "primary");
  if (s.phase === "decision" && (s.rhythm === "pea" || s.rhythm === "asystole") && isAdrenalineDue(s) && s.access) {
    return row("adrenaline", "Adrenaline 1 mg", 10, true, "Due now on the non-shockable limb.", "primary");
  }
  if (s.phase === "cpr" && s.cycleEndsAt != null && s.t >= s.cycleEndsAt - 0.5) {
    return row("assess", "Assess the rhythm", 5, true, "Two minutes are up.");
  }
  if (!s.cprEver) return row("cpr", "Start CPR 30:2", 5, true, "Top of the algorithm, with the call for help.");
  if (!s.defib) return row("defib", "Attach the defibrillator", 20, true, "Antero-lateral pads, then assess.");
  if (s.phase === "arrival") return row("assess", "Assess the rhythm", 5, true, "The limb decides the next move.");
  return null;
}

export function actionsFor(s) {
  if (s.ended) return [];
  const remain = s.phase === "cpr" && s.cycleEndsAt != null ? Math.max(0, Math.round(s.cycleEndsAt - s.t)) : null;
  const cprLabel = !s.cprEver ? "Start CPR 30:2" : s.phase === "postshock" ? "Resume CPR now" : s.cprOn ? "CPR in progress" : "Resume CPR";
  const groups = [];

  const first = [
    row("safety", "Confirm the scene is safe", 5, !s.safety, s.safety ? "Done" : "Top of the algorithm."),
    row("help", "Call the resuscitation team", 10, !s.help, s.help ? "Called" : ""),
    row(
      "cpr",
      cprLabel,
      5,
      s.phase !== "rosc" && !(s.cprOn && s.phase === "cpr"),
      s.phase === "postshock" ? "Immediately after the shock." : s.phase === "rosc" ? "Only if the patient re-arrests." : "",
    ),
    row("oxygen", "Give oxygen", 10, !s.oxygen, s.oxygen ? "On" : ""),
    row("defib", "Attach the defibrillator", 20, !s.defib, s.defib ? "On" : "Antero-lateral pads."),
  ];
  groups.push({ title: "First moves", rows: first });

  groups.push({
    title: "Access and airway",
    rows: [
      row("iv", "IV access", 45, !s.access, s.access === "iv" ? "In" : "Try IV first."),
      row("io", "IO access", 30, !s.access, "If IV is not possible."),
      row("sga", "Supraglottic airway", 20, s.airway !== "sga", s.airway === "sga" ? "In" : "Then continuous compressions."),
      row("ett", "Tracheal tube", 30, s.airway !== "ett", s.airway === "ett" ? "In" : "Then continuous compressions."),
      row("capno", "Waveform capnography", 15, !!s.airway && !s.capno, s.airway ? (s.capno ? "On" : "Use it once the airway is in.") : "Needs a tube or SGA."),
    ],
  });

  groups.push({
    title: "Rhythm",
    rows: [
      row("assess", "Assess the rhythm", 5, s.defib && s.phase !== "postshock", !s.defib ? "Attach the defibrillator first." : s.phase === "postshock" ? "After 2 minutes of CPR." : "Every 2 minutes."),
      row("shock", "Shock", 5, s.phase === "decision" && s.defib, s.phase === "decision" ? "Only if VF or pulseless VT." : "Assess first."),
      row("pulse", "Check for a pulse", 10, s.defib || s.assessCount > 0, "For an organised rhythm. A wasted check on VF or asystole costs time."),
      row("cpr-30", "Continue CPR", remain == null ? 30 : Math.min(30, remain), s.phase === "cpr" && remain > 0, remain > 0 ? `${remain}s to the rhythm check.` : "Start the 2-minute cycle first."),
      row("cpr-to-check", "CPR to the rhythm check", remain ?? 0, s.phase === "cpr" && remain > 0, "Runs the clock to 2 minutes."),
      row("pads", "Pads to antero-posterior", 25, s.defib && s.pads !== "ap", s.shocks >= 3 ? "Consider this after 3 shocks." : "The algorithm says to consider it after 3 shocks."),
    ],
  });

  groups.push({
    title: "Drugs",
    rows: [
      row("adrenaline", s.adrenalineAt.length === 0 ? "Adrenaline 1 mg" : "Adrenaline 1 mg, repeat", 10, !!s.access && s.assessCount > 0 && s.phase !== "rosc", adrenalineHint(s), "drug"),
      row("amiodarone", s.amio === 0 ? "Amiodarone 300 mg" : "Further amiodarone 150 mg", 10, !!s.access && s.assessCount > 0 && s.amio < 2 && s.phase !== "rosc", amioHint(s), "drug"),
    ],
  });

  groups.push({
    title: "Find the cause",
    rows: [
      row("ultrasound", "Ultrasound", 30, !s.ultrasound, "To identify reversible causes."),
      row("abg", "Blood gas", 45, !s.abg, "Potassium, gases, glucose."),
      row("temp", "Temperature", 15, !s.tempChecked, "Hypo- or hyperthermia."),
      row("mechanical", "Mechanical CPR", 40, !s.mechanical, "To facilitate transfer or treatment."),
      row("ecpr", "Consider eCPR or coronary angiography", 20, !s.ecpr, "Named on the algorithm as a consider."),
    ],
  });

  const treatRows = [
    ["hypoxia", "Hypoxia"],
    ["hypovolaemia", "Hypovolaemia"],
    ["metabolic", "Metabolic (K, Ca, Mg, glucose)"],
    ["hypothermia", "Hypo- / hyperthermia"],
    ["thrombosis-coronary", "Thrombosis — coronary"],
    ["thrombosis-pulmonary", "Thrombosis — pulmonary"],
    ["tension", "Tension pneumothorax"],
    ["toxins", "Toxins"],
    ["tamponade", "Tamponade"],
  ].map(([cause, label]) =>
    row("treat", label, 30, !s.treatMarks[cause], s.treatMarks[cause] ? "Treated" : "", "cause", { cause }),
  );
  groups.push({ title: "Treat a reversible cause", rows: treatRows, compact: true });

  if (s.phase === "rosc") {
    groups.push({
      title: "Immediately after ROSC",
      rows: [
        row("post", "ABCDE assessment", 20, !s.post.abcde, "", "post", { item: "abcde" }),
        row("post", "Aim SpO2 94–98%", 20, !s.post.spo2, "", "post", { item: "spo2" }),
        row("post", "Aim a normal PaCO2", 20, !s.post.paco2, "", "post", { item: "paco2" }),
        row("post", "SBP above 100 mmHg", 20, !s.post.sbp, "No dose is printed for this.", "post", { item: "sbp" }),
        row("post", "12-lead ECG", 20, !s.post.ecg, "", "post", { item: "ecg" }),
        row("post", "Identify and treat the cause", 20, !s.post.cause, "", "post", { item: "cause" }),
        row("post", "Temperature control", 20, !s.post.temp, "", "post", { item: "temp" }),
      ],
    });
  }

  groups.push({
    title: "Close",
    rows: [row("end", "End case and debrief", 0, true, "Scores the attempt.", "primary")],
  });

  const now = urgentAction(s);
  if (now) groups.unshift({ title: "Do this next", rows: [now] });
  return groups;
}

function row(type, label, cost, enabled, hint, tone = "default", extra = null) {
  return { type, label, cost, enabled, hint: hint || "", tone, extra };
}

export function pocket(s) {
  if (s.phase === "rosc") {
    return "ROSC. ABCDE. SpO2 94–98% and a normal PaCO2. SBP above 100 mmHg. 12-lead ECG. Identify and treat the cause. Temperature control.";
  }
  if (s.phase === "cpr") {
    const bits = ["CPR in progress. Minimise pauses. Reassess at 2 minutes."];
    if (s.airway) bits.push("Tube or SGA in: continuous compressions.");
    if (isAdrenalineDue(s)) bits.push("Adrenaline is due — give it without stopping CPR.");
    if (isAmioDue(s)) bits.push("Amiodarone is due after 3 shocks.");
    if (s.shocks >= 3 && (s.cycleRhythm === "vf" || s.cycleRhythm === "pvt")) {
      bits.push("Consider antero-posterior pads.");
    }
    return bits.join(" ");
  }
  const r = s.assessCount ? s.cycleRhythm || s.rhythm : null;
  if (!r) return "Unresponsive, no normal breathing. Stay safe, call for help, start CPR 30:2, attach the defibrillator, then assess the rhythm.";
  if (r === "vf" || r === "pvt") {
    return `Shockable (${r === "vf" ? "VF" : "pulseless VT"}). One shock, then CPR for 2 minutes. First adrenaline after 3 shocks (${s.shocks} given), then every 3–5 min. Amiodarone after 3 shocks.`;
  }
  if (r === "rosc") return "Organised rhythm. Check the pulse before you do anything else.";
  return `Non-shockable (${r === "pea" ? "PEA" : "asystole"}). Do not shock. Adrenaline as soon as there is access, then every 3–5 minutes. CPR for 2 minutes. Hunt the reversible causes.`;
}
