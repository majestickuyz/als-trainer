/** Ten arrest cases. The hidden cause is revealed only in the debrief. */

export const CASES = [
  {
    id: "coronary",
    title: "58-year-old man",
    complaint: "Crushing chest pain on the cardiology ward, then unresponsive with agonal gasps.",
    setting: "Cardiology ward",
    start: "vf",
    style: "narrow",
    rate: 42,
    cause: "thrombosis-coronary",
    causeLabel: "thrombosis — coronary",
    critical: "cause",
    truth:
      "VF from coronary thrombosis. A shock only holds if the coronary cause is identified and the angiography pathway is started. Adrenaline and amiodarone follow the shock count, not the diagnosis.",
    learn: [
      "Chest pain into VF is coronary thrombosis until you have a reason to say otherwise.",
      "The first adrenaline and the amiodarone wait until after the third shock.",
      "After ROSC the algorithm asks for a 12-lead ECG and for the cause to be treated — here, that is coronary angiography.",
    ],
    ultrasound:
      "The anterior wall is not moving. No pericardial effusion. Lung sliding is present on both sides. The right ventricle is not dilated.",
    abg: "pH 7.16, PaCO2 6.4 kPa, PaO2 18 kPa on oxygen, K+ 4.1 mmol/L, glucose 6.9 mmol/L.",
    temp: "36.7 °C.",
    evolve(s) {
      if (s.treatMarks["thrombosis-coronary"] && s.shocks >= 1) return { rhythm: "rosc" };
      return { rhythm: "vf" };
    },
  },
  {
    id: "hyperk",
    title: "64-year-old woman",
    complaint: "Missed two dialysis sessions. Found unresponsive in the renal unit chair.",
    setting: "Renal unit",
    start: "pea",
    style: "sine",
    rate: 34,
    cause: "metabolic",
    causeLabel: "hyperkalaemia (metabolic)",
    critical: "cause",
    truth:
      "Hyperkalaemic arrest. It starts as PEA and, if the potassium is not treated, becomes VF and then asystole. ROSC needs the metabolic cause treated and, once it is VF, a shock after that treatment.",
    learn: [
      "Non-shockable rhythms get adrenaline as soon as access is in, then every 3–5 minutes.",
      "A blood gas is how this cause declares itself. The algorithm groups potassium, calcium, magnesium and glucose as the metabolic reversible causes.",
      "When PEA becomes VF, switch limb: shock, and count shocks for amiodarone. Adrenaline you have already started stays on the 3–5 minute clock.",
    ],
    ultrasound:
      "No effusion, lung sliding present, right ventricle not dilated. The QRS on the monitor is very wide.",
    abg: "pH 7.24, PaCO2 4.8 kPa, K+ 7.6 mmol/L, glucose 5.8 mmol/L. The potassium is the finding.",
    temp: "36.2 °C.",
    evolve(s) {
      const mark = s.treatMarks.metabolic;
      if (!mark) {
        if (s.t >= 600) return { rhythm: "asystole" };
        if (s.t >= 150) return { rhythm: "vf" };
        return { rhythm: "pea" };
      }
      if (s.t >= 150 && s.shocks <= mark.shocks) return { rhythm: "vf" };
      if (s.t < 150) return { rhythm: "pea" };
      return { rhythm: "rosc" };
    },
  },
  {
    id: "tension",
    title: "29-year-old man",
    complaint: "Polytrauma. Just intubated in resus. The airway pressures jumped and the pulse was lost.",
    setting: "Emergency department",
    start: "pea",
    style: "narrow",
    rate: 48,
    cause: "tension",
    causeLabel: "tension pneumothorax",
    critical: "cause",
    truth:
      "Tension pneumothorax. PEA continues, and later becomes asystole, until the tension is decompressed. Shocking this rhythm is a critical error.",
    learn: [
      "High airway pressures and a newly intubated trauma patient are the tension story.",
      "Ultrasound: lost lung sliding on one side. Treatment is decompression, by the technique you are trained to use.",
      "PEA is not a rhythm to shock.",
    ],
    ultrasound:
      "No lung sliding on the left. The heart is shifted toward the right. No pericardial effusion.",
    abg: "pH 7.08, PaCO2 9.6 kPa, PaO2 11 kPa, K+ 4.0 mmol/L, glucose 8.1 mmol/L.",
    temp: "36.1 °C.",
    evolve(s) {
      if (s.treatMarks.tension) return { rhythm: "rosc" };
      if (s.t >= 480) return { rhythm: "asystole" };
      return { rhythm: "pea" };
    },
  },
  {
    id: "tamponade",
    title: "71-year-old man",
    complaint: "Day one after aortic valve surgery. The drains have stopped. Then PEA.",
    setting: "Cardiac intensive care",
    start: "pea",
    style: "narrow",
    rate: 40,
    cause: "tamponade",
    causeLabel: "cardiac tamponade",
    critical: "cause",
    truth:
      "Cardiac tamponade. Narrow-complex PEA persists until the tamponade is relieved. Ultrasound shows the effusion.",
    learn: [
      "Surgery, then drains that stop, then PEA: tamponade until proven otherwise.",
      "Ultrasound is on the algorithm specifically to identify reversible causes.",
      "Adrenaline is immediate in PEA, and it does not replace treating the tamponade.",
    ],
    ultrasound:
      "A pericardial effusion with right atrial collapse. Lung sliding is present. The right ventricle is not dilated in the way a pulmonary embolus dilates it.",
    abg: "pH 7.18, PaCO2 5.6 kPa, K+ 4.4 mmol/L, glucose 7.2 mmol/L.",
    temp: "36.5 °C.",
    evolve(s) {
      if (s.treatMarks.tamponade) return { rhythm: "rosc" };
      if (s.t >= 540) return { rhythm: "asystole" };
      return { rhythm: "pea" };
    },
  },
  {
    id: "hypovol",
    title: "55-year-old woman",
    complaint: "A large haematemesis on the gastroenterology ward, then collapse.",
    setting: "Gastroenterology ward",
    start: "pea",
    style: "tachy",
    rate: 120,
    cause: "hypovolaemia",
    causeLabel: "hypovolaemia",
    critical: "cause",
    truth:
      "Hypovolaemia from bleeding. The organised rhythm is a tachycardia without a pulse. ROSC follows treatment of the volume loss. Left alone, the rhythm becomes asystole.",
    learn: [
      "An empty, fast PEA is a volume problem until the history says otherwise.",
      "The algorithm names hypovolaemia. It does not prescribe a volume — bleeding needs blood, under local policy.",
      "A fast organised rhythm is still non-shockable if there is no pulse.",
    ],
    ultrasound: "A small, vigorously contracting heart. No pericardial effusion. Lung sliding present.",
    abg: "pH 7.02, PaCO2 3.8 kPa, K+ 4.9 mmol/L, glucose 9.4 mmol/L, Hb 72 g/L.",
    temp: "35.8 °C.",
    evolve(s) {
      if (s.treatMarks.hypovolaemia) return { rhythm: "rosc" };
      if (s.t >= 420) return { rhythm: "asystole" };
      return { rhythm: "pea" };
    },
  },
  {
    id: "embolus",
    title: "82-year-old woman",
    complaint: "Day six after a hip replacement. Sudden breathlessness, then unresponsive.",
    setting: "Orthopaedic ward",
    start: "pea",
    style: "narrow",
    rate: 52,
    cause: "thrombosis-pulmonary",
    causeLabel: "thrombosis — pulmonary",
    critical: "cause",
    reArrest: true,
    truth:
      "Pulmonary embolism. PEA until the pulmonary thrombosis is treated. After ROSC she re-arrests if the post-ROSC blood pressure and the cause are not secured. One re-arrest, then ROSC returns once CPR has run again.",
    learn: [
      "Recent surgery and sudden collapse is pulmonary thrombosis until you have looked.",
      "Ultrasound: a dilated right ventricle. Treatment follows local thrombolysis or retrieval policy — the card does not print a dose.",
      "ROSC is not the end of the algorithm. SBP above 100 mmHg and ‘identify and treat the cause’ are immediate. This case re-arrests if they are missed.",
    ],
    ultrasound:
      "The right ventricle is dilated and strained. Lung sliding is present. No pericardial effusion.",
    abg: "pH 7.12, PaCO2 3.9 kPa, PaO2 14 kPa on oxygen, K+ 4.2 mmol/L, glucose 6.4 mmol/L.",
    temp: "36.4 °C.",
    evolve(s) {
      const treated = !!s.treatMarks["thrombosis-pulmonary"];
      if (!treated) {
        if (s.t >= 540) return { rhythm: "asystole" };
        return { rhythm: "pea" };
      }
      if (
        s.hadRosc &&
        s.rearrestCount === 0 &&
        s.roscAt != null &&
        s.t >= s.roscAt + 180 &&
        !(s.post.cause && s.post.sbp)
      ) {
        return { rhythm: "pea", rearrest: true };
      }
      if (s.rearrestCount >= 1 && s.phase !== "rosc") {
        if (s.t >= (s.rearrestAt || 0) + 120) return { rhythm: "rosc" };
        return { rhythm: "pea" };
      }
      return { rhythm: "rosc" };
    },
  },
  {
    id: "hypothermia",
    title: "40-year-old man",
    complaint: "Pulled from a river in January. Unresponsive, not shivering, no palpable pulse.",
    setting: "Emergency department",
    start: "pvt",
    style: "wide",
    rate: 40,
    cause: "hypothermia",
    causeLabel: "hypothermia",
    critical: "cause",
    truth:
      "Hypothermic pulseless VT. It stays shockable until rewarming has started and a further shock has been delivered. Drug timing is unchanged: adrenaline and amiodarone still wait for the third shock.",
    learn: [
      "Measure the temperature. Immersion is hypothermia until the number says otherwise.",
      "The algorithm does not tell you to withhold shocks or to bring adrenaline forward. Follow the shockable limb and treat the temperature.",
      "Pulseless VT is shocked on the same limb as VF.",
    ],
    ultrasound: "Poor windows. No effusion, lung sliding present, right ventricle not dilated.",
    abg: "pH 7.08, PaCO2 6.8 kPa, K+ 4.7 mmol/L, glucose 5.1 mmol/L.",
    temp: "27.4 °C. Profoundly hypothermic.",
    evolve(s) {
      const mark = s.treatMarks.hypothermia;
      if (mark && s.shocks > mark.shocks) return { rhythm: "rosc" };
      return { rhythm: "pvt" };
    },
  },
  {
    id: "toxin",
    title: "33-year-old adult",
    complaint: "Found at home beside empty tablet packets. Unresponsive, abnormal breathing.",
    setting: "Home, brought to resus",
    start: "pea",
    style: "wide",
    rate: 46,
    cause: "toxins",
    causeLabel: "toxins",
    critical: "cause",
    truth:
      "A toxicological arrest. Wide-complex PEA becomes VF if it is left, then asystole. ROSC needs the toxin treated and, once the rhythm is VF, a shock after that treatment. No antidote dose is simulated — the card does not name one.",
    learn: [
      "Ask what was taken. Empty packets are the clue.",
      "Do not invent an antidote dose that is not on the algorithm. Treat the toxin under local toxicology guidance, and run the correct limb.",
      "A wide organised rhythm without a pulse is still PEA.",
    ],
    ultrasound: "No structural cause. No effusion, lung sliding present, the heart is not empty.",
    abg: "pH 7.19, PaCO2 5.2 kPa, K+ 4.0 mmol/L, glucose 5.6 mmol/L. The QRS is very wide.",
    temp: "36.8 °C.",
    evolve(s) {
      const mark = s.treatMarks.toxins;
      if (!mark) {
        if (s.t >= 600) return { rhythm: "asystole" };
        if (s.t >= 200) return { rhythm: "vf" };
        return { rhythm: "pea" };
      }
      if (s.shocks <= mark.shocks && s.t >= 200) return { rhythm: "vf" };
      if (s.t < 200 && s.shocks <= mark.shocks) return { rhythm: "pea" };
      return { rhythm: "rosc" };
    },
  },
  {
    id: "refractory",
    title: "47-year-old woman",
    complaint: "Collapsed at home. Bystander CPR was started. The crew hands her over still in VF.",
    setting: "Emergency department",
    start: "vf",
    style: "narrow",
    rate: 42,
    cause: "pads",
    causeLabel: "refractory VF — pad position",
    critical: "pads",
    truth:
      "Refractory VF with no 4H or 4T to find. It converts only when a shock is delivered in the antero-posterior position after at least three shocks. That is the algorithm’s ‘consider’ after 3 shocks, not a hidden metabolic cause.",
    learn: [
      "After three failed shocks, consider moving the pads to antero-posterior.",
      "Amiodarone is due after the third shock, and adrenaline too. Changing the pads does not replace the drugs.",
      "Ultrasound here is negative. Not every arrest has a 4H or 4T you can fix with a drug.",
    ],
    ultrasound:
      "No effusion, the heart is not empty, lung sliding is present, and the right ventricle is not dilated.",
    abg: "pH 7.14, PaCO2 6.0 kPa, K+ 4.0 mmol/L, glucose 6.2 mmol/L. Nothing to hang a metabolic cause on.",
    temp: "36.6 °C.",
    evolve(s) {
      if (s.pads === "ap" && s.shocks >= 4 && s.lastShockPads === "ap") return { rhythm: "rosc" };
      return { rhythm: "vf" };
    },
  },
  {
    id: "hypoxia",
    title: "62-year-old man",
    complaint: "Choked on steak in a restaurant. Cyanosed, unresponsive, an occasional gasp.",
    setting: "Emergency department",
    start: "pea",
    style: "narrow",
    rate: 36,
    cause: "hypoxia",
    causeLabel: "hypoxia",
    critical: "cause",
    truth:
      "Hypoxic PEA from airway obstruction. ROSC needs oxygen, a tracheal tube or supraglottic airway, and hypoxia selected as the cause. Capnography then rises. Left untreated, the rhythm becomes asystole.",
    learn: [
      "Give oxygen, and make the airway secure. Continuous compressions apply once a tube or SGA is in.",
      "Waveform capnography is part of high-quality CPR on the algorithm, not an optional extra.",
      "A very low end-tidal CO2 during CPR that then rises is what ROSC looks like on the capnograph.",
    ],
    ultrasound: "Lung sliding present. No effusion. The heart is not empty. The history is the airway.",
    abg: "pH 7.01, PaCO2 10.4 kPa, PaO2 6.2 kPa, K+ 4.3 mmol/L, glucose 7.5 mmol/L.",
    temp: "36.3 °C.",
    evolve(s) {
      if (s.oxygen && (s.airway === "sga" || s.airway === "ett") && s.treatMarks.hypoxia) {
        return { rhythm: "rosc" };
      }
      if (s.t >= 600) return { rhythm: "asystole" };
      return { rhythm: "pea" };
    },
  },
];

export function getCase(id) {
  const found = CASES.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown case ${id}`);
  return found;
}

export function nextCaseId(id) {
  const i = CASES.findIndex((c) => c.id === id);
  return CASES[(i + 1) % CASES.length].id;
}

export function randomCaseId(except) {
  const pool = CASES.filter((c) => c.id !== except);
  return pool[Math.floor(Math.random() * pool.length)].id;
}
