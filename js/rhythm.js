/** Synthetic monitor traces. Teaching waveforms, not diagnostic recordings. */

function gauss(x, mu, sigma) {
  const d = (x - mu) / sigma;
  return Math.exp(-0.5 * d * d);
}

function hash(t) {
  const s = Math.sin(t * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function sinus(t, bpm) {
  const period = 60 / bpm;
  const x = (t % period) / period;
  let y = 0;
  y += gauss(x, 0.1, 0.022) * 0.16;
  y += gauss(x, 0.22, 0.01) * -0.22;
  y += gauss(x, 0.248, 0.012) * 1.25;
  y += gauss(x, 0.278, 0.014) * -0.32;
  y += gauss(x, 0.46, 0.045) * 0.34;
  return y;
}

function wideComplex(t, bpm) {
  const period = 60 / bpm;
  const x = (t % period) / period;
  let y = 0;
  y += gauss(x, 0.18, 0.02) * -0.35;
  y += gauss(x, 0.26, 0.04) * 1.05;
  y += gauss(x, 0.36, 0.035) * -0.55;
  y += gauss(x, 0.55, 0.06) * 0.2;
  return y;
}

function sineWave(t, bpm) {
  const period = 60 / bpm;
  const x = (t % period) / period;
  return Math.sin(2 * Math.PI * x) * 0.82;
}

export function sampleRhythm(spec, t) {
  const rhythm = spec?.rhythm || "none";
  if (rhythm === "none") return 0;
  if (rhythm === "artefact") {
    return (
      0.85 * Math.sin(2 * Math.PI * 1.8 * t) +
      0.45 * Math.sin(2 * Math.PI * 3.3 * t + 0.6) +
      (hash(t * 3) - 0.5) * 0.55
    );
  }
  if (rhythm === "vf") {
    return (
      0.62 * Math.sin(2 * Math.PI * 3.7 * t + 1.8 * Math.sin(2 * Math.PI * 0.73 * t)) +
      0.32 * Math.sin(2 * Math.PI * 8.4 * t + 1.4 * Math.sin(2 * Math.PI * 1.15 * t)) +
      0.18 * Math.sin(2 * Math.PI * 13.1 * t) +
      (hash(t * 2.2) - 0.5) * 0.5
    );
  }
  if (rhythm === "pvt") {
    const period = 60 / 186;
    const x = (t % period) / period;
    if (x < 0.46) return Math.sin(Math.PI * (x / 0.46)) * 1.15;
    return -0.05 * Math.exp(-(x - 0.46) * 7);
  }
  if (rhythm === "asystole") {
    return (hash(t * 1.4) - 0.5) * 0.045 + 0.02 * Math.sin(2 * Math.PI * 0.2 * t);
  }
  if (rhythm === "pea") {
    const style = spec.style || "narrow";
    const rate = spec.rate || (style === "tachy" ? 120 : 42);
    if (style === "sine") return sineWave(t, rate);
    if (style === "wide") return wideComplex(t, rate);
    return sinus(t, rate) * 0.92;
  }
  if (rhythm === "rosc") return sinus(t, spec.rate || 82);
  return 0;
}

export function rhythmMeta(rhythm, style) {
  switch (rhythm) {
    case "vf":
      return { name: "VF", limb: "Shockable", detail: "Ventricular fibrillation", hr: "—" };
    case "pvt":
      return { name: "pVT", limb: "Shockable", detail: "Pulseless ventricular tachycardia", hr: "≈186" };
    case "pea":
      return {
        name: "PEA",
        limb: "Non-shockable",
        detail: "Organised electrical activity. Check the pulse.",
        hr: style === "tachy" ? "≈120" : style === "sine" ? "≈36" : "≈42",
      };
    case "asystole":
      return { name: "Asystole", limb: "Non-shockable", detail: "No ventricular activity", hr: "—" };
    case "rosc":
      return { name: "Sinus", limb: "ROSC", detail: "Organised rhythm. Confirm a pulse.", hr: "≈82" };
    case "artefact":
      return { name: "CPR", limb: "Cycle", detail: "Compression artefact. Not a rhythm to shock from.", hr: "—" };
    default:
      return { name: "No trace", limb: "—", detail: "Attach the defibrillator.", hr: "—" };
  }
}

export function mountTrace(canvas, getSpec) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const ctx = canvas.getContext("2d");
  const seconds = 6;
  const sampleRate = 140;
  const total = seconds * sampleRate;
  const samples = new Float32Array(total);
  let head = 0;
  let simT = 0;
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  let stopped = false;
  let lastKey = "";

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(10, rect.width);
    const h = Math.max(10, rect.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(spec) {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0c121c";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(61, 222, 138, 0.09)";
    ctx.lineWidth = 1;
    const minor = w / 30;
    for (let x = 0; x < w; x += minor) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += minor) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const rhythm = spec?.rhythm || "none";
    ctx.beginPath();
    ctx.lineWidth = rhythm === "asystole" || rhythm === "none" ? 1.25 : 1.7;
    ctx.strokeStyle = rhythm === "none" ? "rgba(154, 168, 154, 0.45)" : "#3dde8a";
    ctx.shadowColor = "rgba(61, 222, 138, 0.45)";
    ctx.shadowBlur = rhythm === "none" || reduce.matches ? 0 : 6;
    const mid = h * 0.56;
    const amp = h * 0.34;
    const gap = reduce.matches ? 0 : Math.floor(total * 0.03);
    for (let i = 0; i < total; i++) {
      const index = (head + i) % total;
      if (!reduce.matches && i > total - gap) break;
      const x = (i / total) * w;
      const y = mid - samples[index] * amp;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function fillAll(spec) {
    for (let i = 0; i < total; i++) {
      samples[i] = sampleRhythm(spec, i / sampleRate);
    }
    head = 0;
  }

  function keyOf(spec) {
    return `${spec?.rhythm || "none"}|${spec?.style || ""}|${spec?.rate || ""}`;
  }

  function show(spec) {
    const key = keyOf(spec);
    if (key === lastKey) return false;
    lastKey = key;
    fillAll(spec);
    simT = seconds;
    return true;
  }

  function frame(now) {
    if (stopped) return;
    const spec = getSpec() || { rhythm: "none" };
    const changed = show(spec);
    if (reduce.matches) {
      if (changed) draw(spec);
      raf = requestAnimationFrame(frame);
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    acc += dt;
    const step = 1 / sampleRate;
    while (acc >= step) {
      acc -= step;
      samples[head] = sampleRhythm(spec, simT);
      head = (head + 1) % total;
      simT += step;
    }
    draw(spec);
    raf = requestAnimationFrame(frame);
  }

  const observer = new ResizeObserver(() => {
    resize();
    draw(getSpec() || { rhythm: "none" });
  });
  observer.observe(canvas);
  resize();
  fillAll({ rhythm: "none" });
  draw({ rhythm: "none" });
  if (reduce.matches) {
    reduce.addEventListener?.("change", () => {
      lastKey = "";
      if (!reduce.matches) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    });
    lastKey = "";
    frame(performance.now());
  } else {
    raf = requestAnimationFrame(frame);
  }

  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
    },
  };
}
