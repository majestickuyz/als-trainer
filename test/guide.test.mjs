import assert from "node:assert/strict";
import test from "node:test";
import { act, startCase } from "../js/engine.js";
import { SKIP_ACTIONS, currentCard, splitScreen, stageStatus } from "../js/guide.js";

function run(id, steps) {
  let s = startCase(id);
  for (const step of steps) s = act(s, step);
  return s;
}

test("pre-defib cards are one step at a time", () => {
  let s = startCase("coronary");
  assert.equal(splitScreen(s), false);
  assert.equal(currentCard(s, {}).id, "recognise");
  s = act(s, { type: "safety" });
  assert.equal(currentCard(s, {}).id, "help");
  s = act(s, { type: "help" });
  assert.equal(currentCard(s, {}).id, "cpr");
  s = act(s, { type: "cpr" });
  assert.equal(currentCard(s, {}).id, "defib");
  assert.equal(splitScreen(s), false);
  s = act(s, { type: "defib" });
  assert.equal(splitScreen(s), true);
  assert.equal(currentCard(s, {}).id, "assess");
  assert.equal(stageStatus(s).current, "rhythm");
});

test("skip intro lands on an attached defibrillator without a critical error", () => {
  const s = run("tension", SKIP_ACTIONS);
  assert.equal(s.defib, true);
  assert.equal(s.cprEver, true);
  assert.equal(s.oxygen, true);
  assert.equal(s.help, true);
  assert.equal(s.criticals.length, 0);
  assert.equal(currentCard(s, {}).id, "assess");
});

test("after a shockable rhythm the cards go question, charge, resume, then access", () => {
  let s = run("coronary", [...SKIP_ACTIONS, { type: "assess" }]);
  assert.equal(currentCard(s, {}).id, "shockable");
  assert.equal(currentCard(s, { limb: "shock" }).id, "shock-charge");
  assert.equal(currentCard(s, { expert: true, limb: "shock" }).id, "charge");
  assert.equal(currentCard(s, { expert: true, limb: "shock" }).targets[0].act, "shock");
  const oxygen = currentCard(s, { flow: { kind: "shock", step: "oxygen" } });
  assert.equal(oxygen.id, "shock-oxygen");
  const clear = currentCard(s, { flow: { kind: "shock", step: "clear" } });
  assert.equal(clear.id, "shock-clear");
  assert.ok(clear.targets.some((target) => target.act === "shock-skip"));
  s = act(s, { type: "shock" });
  assert.equal(s.phase, "postshock");
  assert.equal(currentCard(s, { flow: { kind: "shock", step: "resume" } }).id, "shock-resume");
  s = act(s, { type: "cpr" });
  assert.equal(currentCard(s, {}).id, "access");
  assert.ok(currentCard(s, {}).targets.some((target) => target.act === "access-iv"));
  assert.equal(currentCard(s, { expert: true }).targets[0].act, "iv");
});

test("a non-shockable decision can still choose a shock", () => {
  const s = run("tension", [...SKIP_ACTIONS, { type: "assess" }]);
  const card = currentCard(s, {});
  assert.equal(card.id, "shockable");
  assert.ok(card.targets.some((target) => target.act === "limb-yes"));
  const charge = currentCard(s, { limb: "shock" });
  assert.equal(charge.targets[0].act, "shock");
});

test("drug card appears once adrenaline is due and there is access", () => {
  let s = run("tension", [...SKIP_ACTIONS, { type: "assess" }, { type: "cpr" }, { type: "iv" }]);
  assert.equal(s.phase, "cpr");
  const card = currentCard(s, {});
  assert.equal(card.nudge, true);
  assert.ok(card.targets.some((target) => target.act === "adrenaline"));
});

test("drug steps confirm dose, route, give, flush and time before the engine is required", () => {
  const s = run("tension", [...SKIP_ACTIONS, { type: "assess" }, { type: "cpr" }, { type: "iv" }]);
  const select = currentCard(s, { flow: { kind: "drug", step: "select", drug: "adrenaline", prompted: "adrenaline" } });
  assert.equal(select.id, "drug-select");
  assert.ok(select.targets.some((target) => target.label === "Adrenaline 1 mg"));
  assert.ok(select.targets.every((target) => !/ml|20/.test(target.label)));
  const route = currentCard(s, { flow: { kind: "drug", step: "route", drug: "adrenaline" } });
  assert.equal(route.id, "drug-route");
  assert.ok(route.targets.some((target) => target.act === "drug-route" && target.route === "iv"));
  const flush = currentCard(s, { flow: { kind: "drug", step: "flush", drug: "adrenaline" } });
  assert.equal(flush.id, "drug-flush");
  assert.match(flush.body, /does not state a flush volume/);
  const basic = currentCard(s, {});
  assert.notEqual(basic.id, "drug-select");
});

test("capnography step follows an advanced airway and names the monitor", () => {
  const s = run("hypoxia", [...SKIP_ACTIONS, { type: "sga" }]);
  const card = currentCard(s, { flow: { kind: "capno", step: "attach" } });
  assert.equal(card.id, "capno-attach");
  assert.equal(card.targets[0].act, "capno");
  assert.match(card.body, /monitor/i);
});

test("reversible causes stay off the main CPR card", () => {
  let s = run("coronary", [...SKIP_ACTIONS, { type: "assess" }, { type: "shock" }, { type: "cpr" }, { type: "iv" }]);
  s = act(s, { type: "cpr-30" });
  const card = currentCard(s, { skipAirway: true, skipCapno: true });
  const acts = card.targets.map((target) => target.act);
  assert.ok(!acts.includes("treat"));
  assert.ok(acts.includes("drawer") || acts.includes("cpr-30") || acts.includes("cpr-to-check") || acts.includes("adrenaline") || acts.includes("amiodarone"));
});
