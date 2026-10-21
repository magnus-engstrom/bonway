// Poäng, streak och topplista. En runda pågår så länge spelaren klarar öar; den avslutas om
// spelaren hoppar till en ny ö innan den pågående är klar, och hamnar då i topplistan.
// Rundan och topplistan sparas i webbläsaren.

// Låga heltal så att varje poäng betyder något
const SCORE = {
  hotStreak: 3,     // från så många perfekta nivåer i rad ger varje perfekt nivå en extra poäng
  islandBonus: 2,   // när nivå 3 är klar
  topSize: 10,
};

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
};

// Rundan och topplistan sparas under egna nycklar i webbläsarens lagring
const newRun = () => ({ score: 0, streak: 0, bestStreak: 0, islands: 0, levels: 0 });
let run = store.get('bonway.run', null) || newRun();
let topRuns = store.get('bonway.top', []); // inte "top", som redan finns i webbläsaren (window.top)

const record = () => Math.max(run.score, 0, ...topRuns.map(t => t.score));

// Räknar poäng för en klarad nivå och uppdaterar rundan: nivåns nummer, +1 för perfekt, +1 till
// för perfekt under het streak och +2 för en klar ö. helped = lösningen har visats på nivån.
function scoreLevel(level, perfect, helped, lastLevel) {
  if (helped) {
    run.streak = 0;
    store.set('bonway.run', run);
    return { points: 0, helped: true };
  }
  run.streak = perfect ? run.streak + 1 : 0;
  run.bestStreak = Math.max(run.bestStreak, run.streak);
  const hot = perfect && run.streak >= SCORE.hotStreak;
  const points = level + (perfect ? 1 : 0) + (hot ? 1 : 0) + (lastLevel ? SCORE.islandBonus : 0);
  run.score += points;
  run.levels++;
  if (lastLevel) run.islands++;
  store.set('bonway.run', run);
  return { points, perfect, hot, streak: run.streak };
}

// Avslutar rundan och sparar den i topplistan. Ger den avslutade rundan, eller null om den var tom.
function endRun() {
  const ended = run.score > 0 ? { ...run, date: new Date().toISOString().slice(0, 10) } : null;
  if (ended) {
    topRuns = [...topRuns, ended].sort((a, b) => b.score - a.score).slice(0, SCORE.topSize);
    store.set('bonway.top', topRuns);
  }
  run = newRun();
  store.set('bonway.run', run);
  return ended;
}
