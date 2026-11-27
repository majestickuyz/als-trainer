# ALS Trainer

An adult Advanced Life Support trainer for one patient at a time, on a clock. Built for practice against the **Resuscitation Council UK 2025 Adult ALS algorithm**.

Educational tool, not a substitute for RCUK ALS training or local policy.

## Use it

Open `index.html` with any static server (modules and the service worker need http, not `file://`):

```bash
python3 -m http.server 4173
```

Then visit `http://localhost:4173`.

- **Cases** — ten arrests, one step at a time. Before the defibrillator is attached the screen is a single prompt. After that the monitor stays up and the next step sits beside it. The 4Hs and 4Ts open from a drawer. Score and debrief at the end. Best scores stay in `localStorage` on the device. Experienced users can start with the defibrillator already on.
- **Explore** — pick a rhythm and a cycle, read the algorithm path, and turn on **Predict first** to commit before the answer is shown.
- **About** — what the model simulates, and what it refuses to invent.

It is a progressive web app: `manifest.webmanifest` and `sw.js` cache the shell for offline use, and it installs from the browser.

## Clinical source

Timing rules come from the Resuscitation Council UK 2025 Adult ALS algorithm card:

- Shockable limb (VF / pulseless VT) and non-shockable limb (PEA / asystole).
- CPR 30:2, then continuous compressions once a tracheal tube or supraglottic airway is in. Rhythm check every 2 minutes.
- Shockable: first adrenaline after 3 shocks, then every 3–5 minutes. Amiodarone after 3 shocks.
- Non-shockable: adrenaline immediately, then every 3–5 minutes.
- Reversible causes as listed (4Hs and 4Ts), the during-CPR items, the consider items, and the immediate post-ROSC items.

Where a dose is shown (adrenaline 1 mg, amiodarone 300 mg, a further 150 mg after five shocks), it is the **RCUK 2025 Adult ALS guideline text**, not a number printed on the algorithm card. The further 150 mg is not on the card, and leaving it out is not scored as a miss. The trainer does not invent fluid volumes, thrombolysis doses, antidotes, or energy settings.

## Pages

GitHub Actions deploys the repository root to GitHub Pages on every push to `main` (`.github/workflows/pages.yml`). The site is intended to be served at `https://majestickuyz.github.io/als-trainer/`. In the repository settings, Pages should use **GitHub Actions** as the source.
