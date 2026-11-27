import { getCase } from "./cases.js";
import { isAdrenalineDue, isAmioDue } from "./engine.js";

export const STAGES = [
  { id: "recognise", label: "Recognise", short: "See" },
  { id: "help", label: "Call for help", short: "Call" },
  { id: "cpr", label: "CPR", short: "CPR" },
  { id: "defib", label: "Defib", short: "Defib" },
  { id: "rhythm", label: "Rhythm", short: "Rhythm" },
  { id: "treat", label: "Treat", short: "Treat" },
  { id: "rosc", label: "ROSC", short: "ROSC" },
];

export const SKIP_ACTIONS = [
  { type: "safety" },
  { type: "help" },
  { type: "cpr" },
  { type: "oxygen" },
  { type: "defib" },
];

const EXPECTED = {
  recognise: "Unresponsive, absent or abnormal breathing. Keep yourself safe.",
  help: "Call the resuscitation team or the ambulance service.",
  cpr: "Start CPR 30:2. Once a tracheal tube or supraglottic airway is in, compress continuously.",
  defib: "Attach the defibrillator and place the pads optimally.",
  rhythm: "Assess the rhythm every 2 minutes. Shock only VF or pulseless VT, then restart CPR at once.",
  treat: "Adrenaline and amiodarone on the algorithm’s clock. Identify and treat the reversible cause. Consider antero-posterior pads after 3 shocks.",
  rosc: "ABCDE. SpO2 94–98% and a normal PaCO2. SBP above 100 mmHg. 12-lead ECG. Identify and treat the cause. Temperature control.",
};

export function splitScreen(s) {
  return !!s.defib;
}

export function stageStatus(s) {
  const done = {
    recognise: !!s.safety,
    help: !!s.help,
    cpr: !!s.cprEver,
    defib: !!s.defib,
    rhythm: s.assessCount > 0,
    treat: !!(s.access || s.adrenalineAt.length || s.amio || s.ultrasound || s.abg || s.tempChecked || Object.keys(s.treatMarks).length),
    rosc: !!(s.hadRosc || s.confirmedRosc),
  };
  let current = "recognise";
  if (!s.defib) current = ["recognise", "help", "cpr", "defib"].find((id) => !done[id]) || "defib";
  else if (s.phase === "rosc" || s.confirmedRosc || (s.ended && s.hadRosc)) current = "rosc";
  else if (s.phase === "cpr") current = "treat";
  else current = "rhythm";
  return { done, current };
}

export function stageVerdict(s, id) {
  const causeOk = s.ended
    ? !s.criticals.some((item) => item.key === "missed-cause" || item.key === "missed-pads")
    : Object.keys(s.treatMarks).length > 0 || (s.pads === "ap" && s.shocks >= 4);
  const map = {
    recognise: !!s.safety,
    help: !!s.help,
    cpr: !!s.cprEver,
    defib: !!s.defib,
    rhythm: s.assessCount > 0 && s.wrongShocks === 0,
    treat: !!causeOk && s.wrongShocks === 0,
    rosc: !!s.hadRosc,
  };
  return { ok: !!map[id], expected: EXPECTED[id] };
}

export function stageLog(s, stageId, stamps) {
  const order = STAGES.map((stage) => stage.id);
  const index = order.indexOf(stageId);
  if (!stamps[stageId] && stageId !== "rosc") return [];
  const start = index <= 0 ? 0 : stamps[order[index - 1]] ?? 0;
  const end = stamps[stageId] ?? s.t;
  return s.log.filter((line) => line.t + 0.001 >= start && line.t <= end + 0.001);
}

/**
 * The one card the arrest should show now.
 * `ui.limb` is only the shockable question ("shock" or "no"), not an engine action.
 * `ui.seenFindings` hides a result that has already been read.
 */
export function currentCard(s, ui = {}) {
  if (s.ended) return null;
  const patient = getCase(s.caseId);
  const freshFinding = s.findings.length > (ui.seenFindings || 0) ? s.findings[s.findings.length - 1] : null;
  if (freshFinding && s.defib) {
    return {
      id: `finding-${s.findings.length}`,
      stage: "treat",
      kicker: freshFinding.title,
      title: "Read this, then go back to the chest.",
      body: freshFinding.text,
      targets: [{ label: "Back to the arrest", act: "dismiss-finding", tone: "primary" }],
    };
  }

  if (!s.safety) {
    return {
      id: "recognise",
      stage: "recognise",
      kicker: "Recognise",
      title: "Unresponsive with absent or abnormal breathing?",
      body: `${patient.title}. ${patient.complaint}`,
      targets: [
        { label: "Yes — the scene is safe", act: "safety", tone: "primary" },
        { label: "Skip intro — defib already on", act: "skip-intro", tone: "ghost" },
      ],
    };
  }
  if (!s.help) {
    return {
      id: "help",
      stage: "help",
      kicker: "Call for help",
      title: "Call the resuscitation team.",
      body: "Shout for help, or call the ambulance service. Then get on the chest.",
      targets: [
        { label: "Call the team", act: "help", tone: "primary" },
        { label: "Skip intro — defib already on", act: "skip-intro", tone: "ghost" },
      ],
    };
  }
  if (!s.cprEver) {
    return {
      id: "cpr",
      stage: "cpr",
      kicker: "CPR",
      title: "Start CPR 30:2.",
      body: "High-quality compressions and ventilations. Give oxygen as you start.",
      targets: [
        { label: "Start CPR 30:2", act: "cpr", tone: "primary" },
        ...(s.oxygen ? [] : [{ label: "Give oxygen", act: "oxygen", tone: "ghost" }]),
        { label: "Skip intro — defib already on", act: "skip-intro", tone: "ghost" },
      ],
    };
  }
  if (!s.defib) {
    return {
      id: "defib",
      stage: "defib",
      kicker: "Defibrillator",
      title: "Attach the defibrillator.",
      body: "Antero-lateral pads. The lateral pad sits below the armpit, in the mid-axillary line — that placement note is from the RCUK 2025 guideline text.",
      targets: [
        { label: "Attach the defibrillator", act: "defib", tone: "primary" },
        ...(s.oxygen ? [] : [{ label: "Give oxygen", act: "oxygen", tone: "ghost" }]),
        { label: "Skip intro — defib already on", act: "skip-intro", tone: "ghost" },
      ].slice(0, 3),
    };
  }

  if (s.phase === "postshock") {
    return {
      id: "resume",
      stage: "rhythm",
      kicker: "Rhythm",
      title: "Resume CPR immediately.",
      body: "Do not pause to look at the rhythm. Two minutes of CPR, then reassess.",
      targets: [{ label: "Resume CPR now", act: "cpr", tone: "primary" }],
    };
  }

  if (s.phase === "decision" && s.rhythm === "rosc") {
    return {
      id: "pulse",
      stage: "rosc",
      kicker: "ROSC",
      title: "Organised rhythm. Is there a pulse?",
      body: "Confirm ROSC before the post-ROSC steps. A shock here is a critical error.",
      targets: [
        { label: "Check for a pulse", act: "pulse", tone: "primary" },
        { label: "Deliver a shock", act: "shock", tone: "shock" },
      ],
    };
  }

  if (s.phase === "decision") {
    const limb = ui.limb || null;
    const name = s.rhythm === "vf" ? "VF" : s.rhythm === "pvt" ? "Pulseless VT" : s.rhythm === "pea" ? "PEA" : "Asystole";
    if (limb === "shock") {
      return {
        id: "charge",
        stage: "rhythm",
        kicker: "Charge",
        title: "Charge and deliver one shock.",
        body: `${name} is on the monitor. Shock only if this is VF or pulseless VT.`,
        targets: [
          { label: "Deliver one shock", act: "shock", tone: "shock" },
          { label: "Back — look again", act: "limb-back", tone: "ghost" },
        ],
      };
    }
    if (limb === "no") {
      const targets = [{ label: "Resume CPR for 2 minutes", act: "cpr", tone: "primary" }];
      if (s.access && isAdrenalineDue(s)) targets.push({ label: "Give adrenaline 1 mg", act: "adrenaline", tone: "ghost" });
      targets.push({ label: "Back — look again", act: "limb-back", tone: "ghost" });
      return {
        id: "no-shock",
        stage: "rhythm",
        kicker: "Non-shockable",
        title: "No shock. Restart CPR.",
        body: "PEA and asystole are not shocked. Adrenaline is given as soon as there is access, then every 3–5 minutes.",
        targets: targets.slice(0, 3),
      };
    }
    return {
      id: "shockable",
      stage: "rhythm",
      kicker: "Rhythm",
      title: "Shockable?",
      body: `The monitor shows ${name}. Shock VF and pulseless VT only.`,
      targets: [
        { label: "Yes — shockable", act: "limb-yes", tone: "primary" },
        { label: "No — not shockable", act: "limb-no", tone: "ghost" },
        { label: "Check for a pulse", act: "pulse", tone: "ghost" },
      ],
    };
  }

  if (s.phase === "rosc") {
    return postCard(s);
  }

  if (s.phase === "cpr") {
    if (s.cycleEndsAt != null && s.t >= s.cycleEndsAt - 0.5) {
      return assessCard("Two minutes are up.", s);
    }
    if (!s.access) return accessCard();
    if (isAdrenalineDue(s) || isAmioDue(s)) return drugCard(s);
    if (!s.airway && !ui.skipAirway) return airwayCard();
    if (s.airway && !s.capno && !ui.skipCapno) return capnoCard();
    return cycleCard(s);
  }

  return assessCard(s.oxygen ? "Read the rhythm, then commit." : "Oxygen is still off. Give it, then read the rhythm.", s);
}

function assessCard(body, s) {
  const targets = [{ label: "Assess the rhythm", act: "assess", tone: "primary" }];
  if (s && !s.oxygen) targets.push({ label: "Give oxygen", act: "oxygen", tone: "ghost" });
  return {
    id: "assess",
    stage: "rhythm",
    kicker: "Rhythm",
    title: "Assess the rhythm.",
    body,
    targets,
  };
}

function accessCard() {
  return {
    id: "access",
    stage: "treat",
    kicker: "Access",
    title: "Get IV access. IO if IV is not possible.",
    body: "Drugs wait for a line. Try IV first.",
    targets: [
      { label: "IV access", act: "iv", tone: "primary" },
      { label: "IO access", act: "io", tone: "ghost" },
      { label: "Keep CPR going", act: "cpr-30", tone: "ghost" },
    ],
  };
}

function drugCard(s) {
  const targets = [];
  if (isAdrenalineDue(s)) {
    targets.push({
      label: s.adrenalineAt.length ? "Adrenaline 1 mg, repeat" : "Adrenaline 1 mg",
      act: "adrenaline",
      tone: "primary",
    });
  }
  if (isAmioDue(s)) {
    targets.push({ label: "Amiodarone 300 mg", act: "amiodarone", tone: "primary" });
  }
  targets.push({ label: "Keep compressions going", act: "cpr-30", tone: "ghost" });
  const which = [
    isAdrenalineDue(s) ? "Adrenaline is due" : "",
    isAmioDue(s) ? "Amiodarone is due after 3 shocks" : "",
  ].filter(Boolean).join(". ");
  return {
    id: `drugs-${s.cycleIndex}-${s.adrenalineAt.length}-${s.amio}`,
    stage: "treat",
    kicker: "Drugs",
    title: "Drugs due during this cycle.",
    body: `${which}. Give them without stopping CPR. 1 mg and 300 mg are the RCUK 2025 guideline doses. The card states the timing.`,
    nudge: true,
    targets: targets.slice(0, 3),
  };
}

function airwayCard() {
  return {
    id: "airway",
    stage: "treat",
    kicker: "Airway",
    title: "Secure the airway?",
    body: "A supraglottic airway or a tracheal tube lets you switch to continuous compressions. You can leave this and keep 30:2.",
    targets: [
      { label: "Supraglottic airway", act: "sga", tone: "primary" },
      { label: "Tracheal tube", act: "ett", tone: "ghost" },
      { label: "Later — keep 30:2", act: "skip-airway", tone: "ghost" },
    ],
  };
}

function capnoCard() {
  return {
    id: "capno",
    stage: "treat",
    kicker: "Capnography",
    title: "Add waveform capnography.",
    body: "The algorithm asks for it once a tube or supraglottic airway is in.",
    targets: [
      { label: "Start waveform capnography", act: "capno", tone: "primary" },
      { label: "Later", act: "skip-capno", tone: "ghost" },
    ],
  };
}

function cycleCard(s) {
  const remain = s.cycleEndsAt == null ? null : Math.max(0, Math.round(s.cycleEndsAt - s.t));
  return {
    id: "cycle",
    stage: "treat",
    kicker: "CPR",
    title: "Chest compressions.",
    body: remain == null
      ? "Minimise interruptions. Reassess at 2 minutes."
      : `${remain} seconds until the rhythm check. The 4Hs and 4Ts sit in the drawer.`,
    targets: [
      { label: remain != null && remain <= 30 ? "CPR to the rhythm check" : "Continue CPR", act: remain != null && remain <= 30 ? "cpr-to-check" : "cpr-30", tone: "primary" },
      ...(remain != null && remain <= 30 ? [] : [{ label: "CPR to the rhythm check", act: "cpr-to-check", tone: "ghost" }]),
      { label: "4Hs and 4Ts", act: "drawer", tone: "ghost" },
    ],
  };
}

const POST_STEPS = [
  { item: "abcde", title: "ABCDE assessment.", label: "Start the ABCDE assessment" },
  { item: "spo2", title: "Aim SpO2 94–98%.", label: "Titrate oxygen to 94–98%" },
  { item: "paco2", title: "Aim a normal PaCO2.", label: "Target a normal PaCO2" },
  { item: "sbp", title: "Aim for SBP above 100 mmHg.", label: "Support the blood pressure" },
  { item: "ecg", title: "Record a 12-lead ECG.", label: "Record the 12-lead" },
  { item: "cause", title: "Identify and treat the cause.", label: "Treat the cause" },
  { item: "temp", title: "Temperature control.", label: "Start temperature control" },
];

function postCard(s) {
  const next = POST_STEPS.find((step) => !s.post[step.item]);
  if (!next) {
    return {
      id: "post-done",
      stage: "rosc",
      kicker: "After ROSC",
      title: "The immediate steps are done.",
      body: "End the case for the debrief. The score uses the same rules as the algorithm card.",
      targets: [{ label: "End case and debrief", act: "end", tone: "primary" }],
    };
  }
  const targets = [{ label: next.label, act: "post", item: next.item, tone: "primary" }];
  targets.push({ label: "End case now", act: "end", tone: "ghost" });
  return {
    id: `post-${next.item}`,
    stage: "rosc",
    kicker: "After ROSC",
    title: next.title,
    body: "Immediately after ROSC. One step, then the next.",
    targets,
  };
}

export function drawerModel(s) {
  const causes = [
    ["hypoxia", "Hypoxia"],
    ["hypovolaemia", "Hypovolaemia"],
    ["metabolic", "Metabolic — K, Ca, Mg, glucose"],
    ["hypothermia", "Hypo- / hyperthermia"],
    ["thrombosis-coronary", "Thrombosis — coronary"],
    ["thrombosis-pulmonary", "Thrombosis — pulmonary"],
    ["tension", "Tension pneumothorax"],
    ["toxins", "Toxins"],
    ["tamponade", "Tamponade — cardiac"],
  ];
  return {
    look: [
      { label: "Ultrasound", act: "ultrasound", done: s.ultrasound },
      { label: "Blood gas", act: "abg", done: s.abg },
      { label: "Temperature", act: "temp", done: s.tempChecked },
    ],
    consider: [
      { label: "Pads to antero-posterior", act: "pads", done: s.pads === "ap" },
      { label: "Mechanical CPR", act: "mechanical", done: s.mechanical },
      { label: "Consider eCPR or coronary angiography", act: "ecpr", done: s.ecpr },
    ],
    drugs: [
      { label: s.adrenalineAt.length ? "Adrenaline 1 mg, repeat" : "Adrenaline 1 mg", act: "adrenaline", done: false },
      { label: s.amio === 0 ? "Amiodarone 300 mg" : "Further amiodarone 150 mg", act: "amiodarone", done: s.amio >= 2 },
    ],
    causes: causes.map(([id, label]) => ({ id, label, act: "treat", done: !!s.treatMarks[id] })),
  };
}
