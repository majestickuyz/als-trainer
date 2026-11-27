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
  assert.equal(currentCard(s, { limb: "shock" }).id, "charge");
  s = act(s, { type: "shock" });
  assert.equal(s.phase, "postshock");
  assert.equal(currentCard(s, {}).id, "resume");
  s = act(s, { type: "cpr" });
  assert.equal(currentCard(s, {}).id, "access");
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

test("reversible causes stay off the main CPR card", () => {
  let s = run("coronary", [...SKIP_ACTIONS, { type: "assess" }, { type: "shock" }, { type: "cpr" }, { type: "iv" }]);
  s = act(s, { type: "cpr-30" });
  const card = currentCard(s, { skipAirway: true, skipCapno: true });
  const acts = card.targets.map((target) => target.act);
  assert.ok(!acts.includes("treat"));
  assert.ok(acts.includes("drawer") || acts.includes("cpr-30") || acts.includes("cpr-to-check") || acts.includes("adrenaline") || acts.includes("amiodarone"));
});
