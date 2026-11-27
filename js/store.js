const KEY = "als-trainer-v1";

function empty() {
  return { cases: {}, history: [] };
}

export function loadRecord() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (!raw || typeof raw !== "object") return empty();
    raw.cases = raw.cases || {};
    raw.history = Array.isArray(raw.history) ? raw.history : [];
    return raw;
  } catch {
    return empty();
  }
}

export function saveResult(s) {
  const rec = loadRecord();
  const prev = rec.cases[s.caseId] || {};
  rec.cases[s.caseId] = {
    best: Math.max(prev.best || 0, s.score),
    attempts: (prev.attempts || 0) + 1,
    passes: (prev.passes || 0) + (s.grade === "Pass" ? 1 : 0),
    last: s.score,
    lastGrade: s.grade,
  };
  rec.history.push({ id: s.caseId, score: s.score, grade: s.grade, at: Date.now() });
  if (rec.history.length > 40) rec.history = rec.history.slice(-40);
  localStorage.setItem(KEY, JSON.stringify(rec));
  return rec;
}

export function clearRecord() {
  localStorage.removeItem(KEY);
  return empty();
}

export function shiftStats(rec) {
  const hist = rec.history || [];
  if (!hist.length) return null;
  const mean = Math.round(hist.reduce((sum, h) => sum + h.score, 0) / hist.length);
  return {
    n: hist.length,
    mean,
    passes: hist.filter((h) => h.grade === "Pass").length,
    fails: hist.filter((h) => h.grade === "Fail").length,
    zeros: hist.filter((h) => h.score === 0).length,
  };
}
