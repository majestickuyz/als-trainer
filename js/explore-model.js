/** Explore-mode timing. Cycle length is the algorithm's 2 minutes. */

export const RHYTHMS = [
  { id: "vf", label: "VF" },
  { id: "pvt", label: "pVT" },
  { id: "pea", label: "PEA" },
  { id: "asystole", label: "Asystole" },
  { id: "rosc", label: "ROSC" },
];

export const MOVES = [
  { id: "shock", label: "One shock, then CPR for 2 minutes" },
  { id: "adrenaline-cpr", label: "Adrenaline now, then CPR for 2 minutes. No shock" },
  { id: "cpr-only", label: "CPR for 2 minutes. No shock, adrenaline not due" },
  { id: "post", label: "Post-ROSC care: ABCDE and the targets" },
];

export function isShockable(rhythm) {
  return rhythm === "vf" || rhythm === "pvt";
}

/** cycle is 1-based. For shockable rhythms it is the shock number. */
export function drugPlan(rhythm, cycle) {
  const n = clampCycle(cycle);
  if (rhythm === "rosc") {
    return {
      move: "post",
      adrenaline: false,
      amiodarone: false,
      amiodaroneSecond: false,
      shock: false,
      pads: false,
      minute: 0,
      next: "ABCDE assessment. Aim SpO2 94–98% and a normal PaCO2. SBP above 100 mmHg. 12-lead ECG. Identify and treat the cause. Temperature control.",
      drugLine: "Arrest drugs stop. Blood-pressure support is part of aiming for SBP above 100 mmHg. The algorithm does not give a dose for that.",
    };
  }
  const minute = (n - 1) * 2;
  if (isShockable(rhythm)) {
    const adrenaline = n >= 3 && (n - 3) % 2 === 0;
    const amiodarone = n === 3;
    const amiodaroneSecond = n === 5;
    const drugs = [];
    if (adrenaline) drugs.push("adrenaline 1 mg");
    if (amiodarone) drugs.push("amiodarone 300 mg");
    if (amiodaroneSecond) drugs.push("a further amiodarone 150 mg (full guideline, after 5 shocks)");
    return {
      move: "shock",
      adrenaline,
      amiodarone,
      amiodaroneSecond,
      shock: true,
      pads: n >= 3,
      minute,
      next: "Deliver one shock, then immediately resume CPR for 2 minutes.",
      drugLine: drugs.length
        ? `During that CPR: ${drugs.join("; ")}.`
        : "No adrenaline or amiodarone with this shock. Adrenaline starts after the 3rd shock, then every 3–5 minutes (every other 2-minute cycle).",
    };
  }
  const adrenaline = n % 2 === 1;
  return {
    move: adrenaline ? "adrenaline-cpr" : "cpr-only",
    adrenaline,
    amiodarone: false,
    amiodaroneSecond: false,
    shock: false,
    pads: false,
    minute,
    next: adrenaline
      ? "Give adrenaline, then immediately resume CPR for 2 minutes. Do not shock PEA or asystole."
      : "CPR for 2 minutes. Adrenaline is not due again yet (the interval is 3–5 minutes). Do not shock.",
    drugLine: adrenaline
      ? n === 1
        ? "Adrenaline 1 mg as soon as there is IV or IO access, then every 3–5 minutes."
        : "Adrenaline 1 mg is due again. Four minutes have passed since the last dose, which sits inside the 3–5 minute interval."
      : "The last adrenaline was only 2 minutes ago. Repeating it now is too soon.",
  };
}

export function activeNodes(rhythm, cycle) {
  const plan = drugPlan(rhythm, cycle);
  const nodes = ["start", "bystander", "assess"];
  if (rhythm === "rosc") {
    nodes.push("rosc", "post");
  } else if (plan.shock) {
    nodes.push("shockable", "shock", "cpr-s");
    if (plan.adrenaline) nodes.push("adr-s");
    if (plan.amiodarone || plan.amiodaroneSecond) nodes.push("amio");
    if (plan.pads) nodes.push("pads");
  } else {
    nodes.push("nonshock", "cpr-n");
    if (plan.adrenaline) nodes.push("adr-n");
  }
  if (rhythm !== "rosc") nodes.push("causes");
  return nodes;
}

export function predictionCorrect(rhythm, cycle, move, drugs) {
  const plan = drugPlan(rhythm, cycle);
  const want = new Set();
  if (plan.adrenaline) want.add("adrenaline");
  if (plan.amiodarone || plan.amiodaroneSecond) want.add("amiodarone");
  const got = new Set(drugs || []);
  const drugsOk = want.size === got.size && [...want].every((d) => got.has(d));
  return { moveOk: move === plan.move, drugsOk, plan };
}

function clampCycle(cycle) {
  return Math.min(6, Math.max(1, cycle | 0));
}

export const DOSE_NOTE =
  "1 mg, 300 mg and 150 mg are the doses in the Resuscitation Council UK 2025 Adult ALS guideline text. The algorithm card states the timing and does not print a dose. A further 150 mg after five shocks is in that guideline text; the card only says to give amiodarone after 3 shocks.";
