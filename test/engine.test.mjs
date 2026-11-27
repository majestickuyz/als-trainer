import assert from "node:assert/strict";
import test from "node:test";
import { CASES } from "../js/cases.js";
import { drugPlan, predictionCorrect } from "../js/explore-model.js";
import { act, actionsFor, startCase } from "../js/engine.js";

function play(id, steps) {
  let s = startCase(id);
  for (const step of steps) {
    const next = act(s, step);
    const blocked =
      next.flash &&
      next.flash.kind === "warn" &&
      next.log.length === s.log.length &&
      next.t === s.t;
    if (blocked) {
      throw new Error(`${id} blocked on ${JSON.stringify(step)}: ${next.flash.text}`);
    }
    s = next;
  }
  return act(s, { type: "end" });
}

function dump(s) {
  return [
    `score ${s.score} ${s.grade} rosc ${s.hadRosc} rhythm ${s.rhythm}`,
    ...s.criticals.map((c) => `CRIT ${c.text}`),
    ...s.penalties.map((p) => `-${p.points} ${p.text}`),
  ].join("\n");
}

const prep = [
  { type: "safety" },
  { type: "help" },
  { type: "cpr" },
  { type: "oxygen" },
  { type: "defib" },
  { type: "iv" },
];

const postBundle = [
  { type: "post", item: "cause" },
  { type: "post", item: "sbp" },
  { type: "post", item: "abcde" },
  { type: "post", item: "spo2" },
  { type: "post", item: "paco2" },
  { type: "post", item: "ecg" },
  { type: "post", item: "temp" },
];

test("shocking PEA is a critical fail", () => {
  const s = play("tension", [...prep, { type: "assess" }, { type: "shock" }]);
  assert.equal(s.score, 0);
  assert.equal(s.grade, "Fail");
  assert.ok(s.criticals.some((c) => c.key === "shock-nonshockable"));
});

test("adrenaline before the third shock is penalised and does not fail the case by itself", () => {
  let s = startCase("coronary");
  for (const step of [...prep, { type: "assess" }, { type: "adrenaline" }]) s = act(s, step);
  assert.ok(s.penalties.some((p) => p.key === "early-adr"));
  assert.equal(s.criticals.length, 0);
  assert.equal(s.adrenalineAt.length, 1);
});

test("coronary VF reaches ROSC when the coronary cause is treated", () => {
  const s = play("coronary", [
    ...prep,
    { type: "assess" },
    { type: "shock" },
    { type: "cpr" },
    { type: "ultrasound" },
    { type: "treat", cause: "thrombosis-coronary" },
    { type: "cpr-to-check" },
    { type: "assess" },
    { type: "pulse" },
    ...postBundle,
  ]);
  assert.equal(s.hadRosc, true, dump(s));
  assert.equal(s.criticals.length, 0, dump(s));
  assert.ok(s.score >= 80, dump(s));
  assert.equal(s.grade, "Pass", dump(s));
});

test("hyperkalaemia converts PEA to VF and recovers after treatment and a shock", () => {
  const s = play("hyperk", [
    ...prep,
    { type: "assess" },
    { type: "adrenaline" },
    { type: "cpr" },
    { type: "abg" },
    { type: "treat", cause: "metabolic" },
    { type: "cpr-to-check" },
    { type: "assess" },
    { type: "shock" },
    { type: "cpr" },
    { type: "cpr-to-check" },
    { type: "assess" },
    { type: "pulse" },
    ...postBundle,
  ]);
  assert.equal(s.hadRosc, true, dump(s));
  assert.ok(s.log.some((l) => l.text.includes("VF") || l.text.includes("ventricular fibrillation")), dump(s));
  assert.ok(s.score >= 80, dump(s));
});

test("tension pneumothorax recovers without a shock", () => {
  const s = play("tension", [
    ...prep,
    { type: "assess" },
    { type: "adrenaline" },
    { type: "cpr" },
    { type: "ultrasound" },
    { type: "treat", cause: "tension" },
    { type: "cpr-to-check" },
    { type: "assess" },
    { type: "pulse" },
    ...postBundle,
  ]);
  assert.equal(s.shocks, 0);
  assert.equal(s.hadRosc, true, dump(s));
  assert.ok(s.score >= 80, dump(s));
});

test("tamponade and hypovolaemia and hypoxia are winnable", () => {
  const tamponade = play("tamponade", [
    ...prep,
    { type: "assess" },
    { type: "adrenaline" },
    { type: "cpr" },
    { type: "ultrasound" },
    { type: "treat", cause: "tamponade" },
    { type: "cpr-to-check" },
    { type: "assess" },
    { type: "pulse" },
    ...postBundle,
  ]);
  assert.ok(tamponade.score >= 80, dump(tamponade));

  const hypo = play("hypovol", [
    ...prep,
    { type: "assess" },
    { type: "adrenaline" },
    { type: "cpr" },
    { type: "treat", cause: "hypovolaemia" },
    { type: "cpr-to-check" },
    { type: "assess" },
    { type: "pulse" },
    ...postBundle,
  ]);
  assert.ok(hypo.score >= 80, dump(hypo));

  const hypoxia = play("hypoxia", [
    ...prep,
    { type: "sga" },
    { type: "capno" },
    { type: "assess" },
    { type: "adrenaline" },
    { type: "cpr" },
    { type: "treat", cause: "hypoxia" },
    { type: "cpr-to-check" },
    { type: "assess" },
    { type: "pulse" },
    ...postBundle,
  ]);
  assert.equal(hypoxia.hadRosc, true, dump(hypoxia));
  assert.ok(hypoxia.score >= 80, dump(hypoxia));
});

test("pulmonary embolism re-arrests if post-ROSC care is left, and holds if it is done", () => {
  const early = [
    ...prep,
    { type: "assess" },
    { type: "adrenaline" },
    { type: "cpr" },
    { type: "ultrasound" },
    { type: "treat", cause: "thrombosis-pulmonary" },
    { type: "cpr-to-check" },
    { type: "assess" },
    { type: "pulse" },
  ];
  const safe = play("embolus", [...early, ...postBundle]);
  assert.equal(safe.hadRosc, true, dump(safe));
  assert.equal(safe.rearrestCount, 0, dump(safe));
  assert.ok(safe.score >= 80, dump(safe));

  let risky = startCase("embolus");
  for (const step of early) risky = act(risky, step);
  const roscAt = risky.roscAt;
  for (const step of [
    { type: "post", item: "abcde" },
    { type: "post", item: "spo2" },
    { type: "post", item: "paco2" },
    { type: "post", item: "ecg" },
    { type: "post", item: "temp" },
    { type: "abg" },
  ]) {
    risky = act(risky, step);
  }
  assert.ok(risky.t - roscAt < 180, "still inside the post-ROSC window");
  assert.equal(risky.rearrestCount, 0, dump(risky));
  risky = act(risky, { type: "mechanical" });
  assert.equal(risky.rearrestCount, 1, `expected re-arrest\n${dump(risky)}\n${risky.t - roscAt}s after ROSC`);
  assert.equal(risky.rhythm, "pea");
  assert.equal(risky.confirmedRosc, false);
});

test("hypothermia needs a shock after rewarming starts", () => {
  const s = play("hypothermia", [
    ...prep,
    { type: "assess" },
    { type: "temp" },
    { type: "treat", cause: "hypothermia" },
    { type: "shock" },
    { type: "cpr" },
    { type: "cpr-to-check" },
    { type: "assess" },
    { type: "pulse" },
    ...postBundle,
  ]);
  assert.equal(s.hadRosc, true, dump(s));
  assert.equal(s.amio, 0);
  assert.ok(s.score >= 80, dump(s));
});

test("toxin converts and recovers", () => {
  const s = play("toxin", [
    ...prep,
    { type: "assess" },
    { type: "adrenaline" },
    { type: "cpr" },
    { type: "treat", cause: "toxins" },
    { type: "cpr-to-check" },
    { type: "assess" },
    { type: "shock" },
    { type: "cpr" },
    { type: "cpr-to-check" },
    { type: "assess" },
    { type: "pulse" },
    ...postBundle,
  ]);
  assert.equal(s.hadRosc, true, dump(s));
  assert.ok(s.score >= 80, dump(s));
});

test("refractory VF needs antero-posterior pads after three shocks, plus the drugs", () => {
  const steps = [...prep, { type: "assess" }];
  for (let i = 0; i < 3; i++) {
    steps.push({ type: "shock" }, { type: "cpr" });
    if (i === 2) {
      steps.push({ type: "adrenaline" }, { type: "amiodarone" }, { type: "pads" });
    }
    steps.push({ type: "cpr-to-check" }, { type: "assess" });
  }
  steps.push({ type: "shock" }, { type: "cpr" }, { type: "cpr-to-check" }, { type: "assess" }, { type: "pulse" }, ...postBundle);
  const s = play("refractory", steps);
  assert.equal(s.hadRosc, true, dump(s));
  assert.equal(s.pads, "ap");
  assert.equal(s.amio, 1);
  assert.ok(s.adrenalineAt.length >= 1);
  assert.ok(s.score >= 80, dump(s));

  const missed = play("refractory", [
    ...prep,
    { type: "assess" },
    { type: "shock" },
    { type: "cpr" },
    { type: "cpr-to-check" },
    { type: "assess" },
    { type: "shock" },
    { type: "cpr" },
    { type: "cpr-to-check" },
    { type: "assess" },
    { type: "shock" },
    { type: "cpr" },
    { type: "adrenaline" },
    { type: "amiodarone" },
    { type: "cpr-to-check" },
    { type: "assess" },
  ]);
  assert.equal(missed.hadRosc, false);
  assert.equal(missed.score, 0, dump(missed));
});

test("ending without treating an obvious cause fails", () => {
  const s = play("tamponade", [...prep, { type: "assess" }, { type: "adrenaline" }, { type: "cpr" }, { type: "cpr-to-check" }]);
  assert.equal(s.score, 0);
  assert.ok(s.criticals.some((c) => c.key === "missed-cause"));
});

test("amiodarone in PEA is a wrong-drug penalty", () => {
  let s = startCase("tension");
  for (const step of [...prep, { type: "assess" }, { type: "amiodarone" }]) s = act(s, step);
  assert.ok(s.penalties.some((p) => p.key.startsWith("amio-wrong")));
  assert.equal(s.amio, 0);
});

test("shock is not offered during a CPR cycle", () => {
  let s = startCase("coronary");
  for (const step of [...prep, { type: "assess" }, { type: "shock" }, { type: "cpr" }]) s = act(s, step);
  const shock = actionsFor(s).flatMap((g) => g.rows).find((r) => r.type === "shock");
  assert.equal(shock.enabled, false);
  const next = act(s, { type: "shock" });
  assert.equal(next.shocks, 1);
  assert.equal(next.flash.kind, "warn");
});

test("explore timing matches the algorithm card", () => {
  assert.equal(drugPlan("vf", 1).move, "shock");
  assert.equal(drugPlan("vf", 1).adrenaline, false);
  assert.equal(drugPlan("vf", 3).adrenaline, true);
  assert.equal(drugPlan("vf", 3).amiodarone, true);
  assert.equal(drugPlan("vf", 4).adrenaline, false);
  assert.equal(drugPlan("vf", 5).adrenaline, true);
  assert.equal(drugPlan("vf", 5).amiodaroneSecond, true);
  assert.equal(drugPlan("pea", 1).move, "adrenaline-cpr");
  assert.equal(drugPlan("asystole", 2).move, "cpr-only");
  assert.equal(drugPlan("asystole", 2).shock, false);
  assert.equal(drugPlan("rosc", 1).move, "post");
  const marked = predictionCorrect("vf", 3, "shock", ["adrenaline", "amiodarone"]);
  assert.equal(marked.moveOk, true);
  assert.equal(marked.drugsOk, true);
  const missed = predictionCorrect("pea", 1, "shock", []);
  assert.equal(missed.moveOk, false);
});

test("every case id is unique and playable to a debrief", () => {
  assert.equal(new Set(CASES.map((c) => c.id)).size, CASES.length);
  assert.ok(CASES.length >= 8 && CASES.length <= 10);
  for (const c of CASES) {
    const s = play(c.id, [{ type: "safety" }]);
    assert.equal(s.ended, true);
    assert.equal(typeof s.score, "number");
  }
});
