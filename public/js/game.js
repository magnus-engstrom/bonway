// Bonway: spelet i webbläsaren. Laddar öarna, ritar planen, tar emot klick och tangenter och håller
// reda på nivåer, poäng och sparad progress. Bygger på generator.js (regler och lösare), city.js
// (grafik), effects.js (animationer) och score.js (poäng och topplista).

const COLORS = ['#e5534b', '#3d8bfd', '#f2c14e']; // bilarnas färger: röd, blå, gul
const CELL_MS = 70;                                // hur länge en bil tar på sig per ruta
const LOCK = '<svg viewBox="0 0 12 12" aria-label="låst"><rect x="2" y="5.5" width="8" height="6" rx="1.2" fill="currentColor"/><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d'), intro = $('intro');

// ---------- Tillstånd ----------

// En ö spelas i tre nivåer på samma karta: med en, två och tre bilar
let pool = [];           // öarna från puzzles.json, i den ordning alla spelar dem
let island = store.get('bonway.island', 0);
let set = null;          // ön: { grid, lines, stages }
let stage = 1;           // nivån som spelas
let cleared = [];        // cleared[s] = true när nivå s är klarad på ön
let puzzle = null;       // nivån: { grid, lines: [{ start, exits }], exitOwner, limit, solution }
let moves = [];          // [{ li, d }]
let selected = -1;       // vald bil
let anim = null;         // bilen som kör: { li, cells, t0 }
let playing = false;     // lösningen spelas upp och input är låst
let levelClean = true;   // nivån spelas utan ångra, börja om eller slut på drag (perfekt)
let levelHelped = false; // lösningen har visats på nivån, så den ger inga poäng
let lastEnded = null;    // senast avslutade runda, markeras i topplistan
let current = 0;         // ön som visas just nu
let visiting = false;    // ön öppnades via en länk till en annan ö än spelarens egen: inga poäng

// Progressen på ön sparas så att spelaren fortsätter på rätt nivå efter omladdning. Ett avbrutet
// försök räknas som att börja om, så nivån är då inte längre perfekt.
function saveProgress() {
  if (visiting) return;
  store.set('bonway.progress', { island, stage, cleared, helped: levelHelped, clean: levelClean && !moves.length });
}

// ---------- Rendering ----------

let cell = 20, dpr = 1;
let cityLayer = null;    // ön ritas en gång per nivå och storlek
let water = [], sparkles = [];
let reveal = null;       // starttid för vågen när en ny ö byggs upp
let popAt = 0;           // starttid när bilarna studsar fram
let confetti = [], banner = null;

const cx = p => (p % W + 0.5) * cell, cy = p => (((p / W) | 0) + 0.5) * cell;

function rebuildCity() {
  cityLayer = puzzle ? renderCity(puzzle, cell, dpr) : null;
  water = puzzle ? waterCells(puzzle) : [];
  sparkles = [];
}

function resize() {
  // Planen fyller bredden upp till 760 px men lämnar plats på höjden för panelen och knapparna
  const avail = Math.min($('wrap').clientWidth, 760, window.innerHeight - 210);
  cell = Math.max(10, Math.floor(Math.max(avail, 220) / W));
  document.documentElement.style.setProperty('--board', W * cell + 'px');
  dpr = window.devicePixelRatio || 1;
  cv.width = W * cell * dpr; cv.height = H * cell * dpr;
  cv.style.width = W * cell + 'px'; cv.style.height = H * cell + 'px';
  rebuildCity();
  draw();
}

// pts är [x, y]-punkter i pixlar
function strokePath(pts, color, width, alpha = 1) {
  if (pts.length < 2) return;
  ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(...pts[0]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(...pts[i]);
  ctx.stroke(); ctx.globalAlpha = 1;
}

// En liten vit pil i cellen p som pekar i riktning d, närmast bilen
function drawArrow(p, d) {
  const [dx, dy] = DIRS[d], r = cell * 0.18, x = cx(p) - dx * cell * 0.12, y = cy(p) - dy * cell * 0.12;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = cell * 0.08;
  ctx.beginPath();
  ctx.moveTo(x + dx * r, y + dy * r);
  ctx.lineTo(x - dx * r * 0.7 - dy * r, y - dy * r * 0.7 + dx * r);
  ctx.lineTo(x - dx * r * 0.7 + dy * r, y - dy * r * 0.7 - dx * r);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// Riktningen bilen ska peka åt: senaste draget, annars första möjliga riktningen från start
function vanDir(st, li) {
  for (let i = moves.length - 1; i >= 0; i--) if (moves[i].li === li) return moves[i].d;
  const m = lineMoves(puzzle, p => st.occ[p], li, puzzle.lines[li].start)[0];
  return m ? m.d : 0;
}

function draw(now = performance.now()) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0d1018'; ctx.fillRect(0, 0, W * cell, H * cell);
  if (!puzzle) return;
  if (cityLayer) {
    if (reveal && !calm) { if (drawReveal(ctx, cityLayer, cell, dpr, reveal, now)) reveal = null; }
    else ctx.drawImage(cityLayer, 0, 0, W * cell, H * cell);
  }
  if (!calm && !reveal) { updateSparkles(sparkles, water, cell, now); drawSparkles(ctx, sparkles, now); }
  const st = stateFrom(puzzle, moves);

  // Startplatsen syns som en svag streckad ruta när bilen har kört därifrån
  puzzle.lines.forEach((l, i) => {
    if (st.trails[i].length < 2) return;
    const x = l.start % W * cell, y = ((l.start / W) | 0) * cell;
    ctx.globalAlpha = 0.5; ctx.setLineDash([cell * 0.12, cell * 0.08]); ctx.strokeStyle = COLORS[i]; ctx.lineWidth = 2;
    ctx.strokeRect(x + cell * 0.12, y + cell * 0.12, cell * 0.76, cell * 0.76);
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  });

  puzzle.lines.forEach((l, i) => {
    let tr = st.trails[i], pos = [cx(tr[tr.length - 1]), cy(tr[tr.length - 1])];
    if (anim && anim.li === i) {
      // Bilen kör fram ruta för ruta och rutten växer bakom den
      const n = anim.cells.length, t = Math.min(n, (now - anim.t0) / CELL_MS), k = Math.floor(t), f = t - k;
      tr = tr.slice(0, tr.length - n + k);
      const a = tr[tr.length - 1], b = k < n ? anim.cells[k] : a;
      pos = [cx(a) + (cx(b) - cx(a)) * f, cy(a) + (cy(b) - cy(a)) * f];
    }
    strokePath([...tr.map(p => [cx(p), cy(p)]), pos], '#fff', cell * 0.34, 0.55);
    strokePath([...tr.map(p => [cx(p), cy(p)]), pos], COLORS[i], cell * 0.24, 0.95);
    // Den valda bilen glöder och skakar lite när den står still; nya bilar studsar fram
    const active = i === selected && !st.done[i], s = calm ? 1 : vanPop(i, popAt, now);
    if (s <= 0) return;
    ctx.save();
    ctx.translate(pos[0], pos[1]); ctx.scale(s, s); ctx.translate(-pos[0], -pos[1]);
    drawVan(ctx, i, vanDir(st, i), pos[0], pos[1], cell, active && s >= 1, active && !calm && !(anim && anim.li === i) ? 1 : 0, now);
    ctx.restore();
  });

  // Bara pilar för möjliga riktningar; var bilen stannar får spelaren räkna ut själv
  if (!anim && !playing && vanPop(selected, popAt, now) >= 1) for (const o of choices(st)) drawArrow(o.from + STEP[o.d], o.d);

  if (confetti.length) drawConfetti(ctx, confetti, now);
  if (banner && !drawBanner(ctx, banner, now, cell)) banner = null;

  if (anim && now - anim.t0 >= anim.cells.length * CELL_MS + 30) { anim = null; draw(now); }
}

// Planen ritas om varje bildruta för vattnets blänk och bilarnas rörelse; webbläsaren pausar
// slingan när fliken inte syns. Med reducerad rörelse ritas bara om under bilanimationer.
function tick(now) {
  if (!calm || anim) draw(now);
  requestAnimationFrame(tick);
}

// ---------- Spellogik ----------

const fromOf = (st, li) => st.trails[li][st.trails[li].length - 1];

// Riktningar den valda bilen kan köra i just nu
function choices(st) {
  if (selected < 0 || st.done[selected] || moves.length >= puzzle.limit) return [];
  const from = fromOf(st, selected);
  return [0, 1, 2, 3]
    .map(d => ({ d, from, cells: slide(puzzle.grid, p => st.occ[p], puzzle.exitOwner, selected, from, d) }))
    .filter(o => o.cells.length);
}

function move(li, d) {
  const st = stateFrom(puzzle, moves);
  const cells = slide(puzzle.grid, p => st.occ[p], puzzle.exitOwner, li, fromOf(st, li), d);
  if (!cells.length || st.done[li] || moves.length >= puzzle.limit) return false;
  moves.push({ li, d });
  anim = { li, cells, t0: performance.now() };
  const firstClear = !cleared[stage], arrive = cells.length * CELL_MS;
  afterChange();
  const after = stateFrom(puzzle, moves);
  if (after.done[li]) playSound('point', arrive);
  if (playing || !after.done.every(Boolean)) return true;
  playSound(stage === set.stages.length ? 'island' : 'level', arrive + 250);
  // Poäng bara första gången nivån klaras på ön
  const result = firstClear && !visiting ? scoreLevel(stage, levelClean, levelHelped, stage === set.stages.length) : null;
  showScore(result && result.points > 0);
  // Firande när sista bilen har kommit fram
  if (!calm) celebrate(after, anim.t0 + cells.length * CELL_MS, result);
  return true;
}

function celebrate(st, t0, result) {
  const points = st.trails.map((tr, i) => [cx(tr[tr.length - 1]), cy(tr[tr.length - 1]), COLORS[i]]);
  spawnConfetti(confetti, points, cell, t0);
  let sub = '';
  if (visiting) sub = 'Spelad via länk – inga poäng';
  else if (result && result.helped) sub = 'Lösningen visades – inga poäng';
  else if (result) sub = [`+${result.points} poäng`, result.perfect && 'Perfekt', result.streak > 1 && `🔥 ${result.streak}`].filter(Boolean).join(' · ');
  banner = { text: stage === set.stages.length ? 'Ön klar!' : `Nivå ${stage} klar!`, sub, t0 };
}

function autoSelect(st) {
  if (selected >= 0 && !st.done[selected]) return;
  selected = st.done.findIndex(x => !x);
}

// Uppdaterar panel, meddelande och knappar efter varje förändring
function afterChange() {
  const st = stateFrom(puzzle, moves);
  autoSelect(st);
  const left = puzzle.limit - moves.length, doneCount = st.done.filter(Boolean).length;
  const won = doneCount === puzzle.lines.length, last = stage === set.stages.length;
  $('movesLeft').textContent = left;
  $('movesBox').classList.toggle('low', left <= 1 && !won);
  showScore();

  const msg = $('msg');
  if (won) {
    msg.textContent = playing ? 'Så här går det.' : last ? 'Ön är klar!' : visiting ? 'Klart!' : `Klart! Nivå ${stage + 1} är upplåst.`;
    msg.className = 'ok';
  } else if (left === 0) {
    msg.textContent = 'Slut på drag. Ångra eller börja om.'; msg.className = 'bad';
    if (!playing) levelClean = false;
  } else {
    msg.textContent = ''; msg.className = '';
  }
  if (won && !playing) cleared[stage] = true;
  if (!playing) saveProgress();

  $('next').hidden = !won || playing;
  $('next').textContent = !last ? 'Nästa nivå' : visiting ? 'Till min ö' : 'Ny ö';
  $('new').textContent = visiting ? 'Till min ö' : 'Hoppa över ön';
  // En nivå låses upp när den föregående är klarad; på en ö från en länk är alla nivåer öppna
  document.querySelectorAll('#count button').forEach(b => {
    const k = +b.dataset.k, locked = !visiting && k > 1 && !cleared[k - 1];
    b.setAttribute('aria-pressed', k === stage);
    b.disabled = locked;
    b.title = locked ? `Klara nivå ${k - 1} först` : '';
    b.innerHTML = `${k}` + (cleared[k] ? '<span class="check" aria-label="klarad">✓</span>' : locked ? LOCK : '');
  });
  $('undo').disabled = !moves.length || playing;
  $('reset').disabled = !moves.length || playing;
  $('solve').disabled = playing;
  draw();
}

// Poäng och streak i panelen; bump ger siffrorna en liten studs när poängen ökar
function showScore(bump = false) {
  $('score').textContent = run.score.toLocaleString('sv-SE');
  $('streak').textContent = run.streak;
  $('streakBox').classList.toggle('hot', run.streak > 0);
  if (bump) for (const id of ['score', 'streak']) {
    const el = $(id);
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }
}

// Länkar till en ö och nivå: #7 öppnar ö 7 och #7-2 ö 7 nivå 2. Adressen följer med när man
// spelar, så att den går att dela direkt.
function linkFromHash() {
  const m = /^#(\d+)(?:-([123]))?$/.exec(location.hash);
  return m && +m[1] > 0 ? { island: +m[1] - 1, stage: m[2] ? +m[2] : 1 } : null;
}

// Laddar en ö. Utan link är det spelarens egen ö, och advance går vidare till nästa i ordningen.
// En länk till en annan ö öppnas utan poäng och utan att spelarens progress påverkas.
function newIsland(advance = false, note = '', link = null) {
  if (advance) { island++; store.set('bonway.island', island); }
  visiting = !!link && link.island !== island;
  current = visiting ? link.island : island;
  $('msg').textContent = 'Bygger ön …'; $('msg').className = '';
  // Låt texten hinna ritas innan en eventuell tung generering körs
  setTimeout(() => {
    // Efter sista ön börjar ordningen om; utan puzzles.json skapas öar direkt i webbläsaren
    const next = pool.length ? deserialize(pool[current % pool.length]) : generate(3);
    if (!next) { $('msg').textContent = 'Kunde inte skapa en ö. Försök igen.'; $('msg').className = 'bad'; return; }
    set = next;
    $('island').textContent = `Ö ${current + 1}`;
    reveal = calm ? null : performance.now();
    if (visiting) {
      cleared = [];
      startStage(link.stage);
      note = note || `Du spelar Ö ${current + 1} via en länk – det ger inga poäng.`;
    } else {
      const saved = store.get('bonway.progress', null), mine = saved && saved.island === island;
      cleared = mine ? saved.cleared : [];
      let s = mine ? saved.stage : 1, restore = mine ? saved : null;
      // En länk till den egna ön får bara öppna nivåer som är upplåsta
      if (link && link.stage !== s) {
        if (link.stage === 1 || cleared[link.stage - 1]) { s = link.stage; restore = null; }
        else note = note || `Nivå ${link.stage} är inte upplåst än.`;
      }
      startStage(s, restore);
    }
    if (note) $('msg').textContent = note;
  }, 20);
}

// Startar nivå s på ön. restore är sparad progress efter omladdning: { clean, helped }.
function startStage(s, restore = null) {
  stage = s;
  puzzle = stagePuzzle(set, s); moves = []; selected = -1; anim = null;
  confetti = []; banner = null;
  levelClean = restore ? restore.clean : true;
  levelHelped = restore ? restore.helped : false;
  // Bilarna studsar fram, efter att ön har byggts upp om den är ny
  popAt = performance.now() + (reveal ? revealDuration() * 0.75 : 0);
  history.replaceState(null, '', `#${current + 1}-${s}`);
  rebuildCity();
  afterChange();
}

async function playSolution() {
  levelHelped = true;
  playing = true; moves = []; selected = -1;
  afterChange();
  for (const m of puzzle.solution) {
    await new Promise(r => setTimeout(r, 450));
    selected = m.li; move(m.li, m.d);
  }
  // Låt lösningen synas en stund och återställ sedan planen så att spelaren får lösa nivån själv
  await new Promise(r => setTimeout(r, 1400));
  playing = false; moves = []; selected = -1; anim = null;
  afterChange();
  $('msg').textContent = 'Din tur! Nivån ger inga poäng när lösningen har visats.'; $('msg').className = '';
}

// ---------- Input ----------

function cellAt(e) {
  const r = cv.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / cell), y = Math.floor((e.clientY - r.top) / cell);
  return x >= 0 && y >= 0 && x < W && y < H ? y * W + x : -1;
}

cv.addEventListener('click', e => {
  if (!puzzle || playing) return;
  const p = cellAt(e); if (p < 0) return;
  const st = stateFrom(puzzle, moves);
  // Klick rakt ut från bilen i en möjlig riktning gör draget
  const px = p % W, py = (p / W) | 0;
  const hit = choices(st).find(o => {
    const fx = o.from % W, fy = (o.from / W) | 0, [dx, dy] = DIRS[o.d];
    return dx ? py === fy && Math.sign(px - fx) === dx : px === fx && Math.sign(py - fy) === dy;
  });
  if (hit) { move(selected, hit.d); return; }
  // Klick på en bil eller dess rutt väljer bilen, och motorn startar
  const li = st.trails.findIndex(tr => tr.includes(p));
  if (li >= 0 && !st.done[li]) { selected = li; playSound('engine'); draw(); }
});

window.addEventListener('keydown', e => {
  if (!puzzle || playing || intro.open) return;
  const d = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 }[e.key];
  if (d !== undefined && selected >= 0) { e.preventDefault(); move(selected, d); return; }
  const n = +e.key;
  if (n >= 1 && n <= puzzle.lines.length && !stateFrom(puzzle, moves).done[n - 1]) { selected = n - 1; playSound('engine'); draw(); }
  if (e.key === 'z' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); $('undo').click(); }
});

$('undo').onclick = () => { moves.pop(); anim = null; levelClean = false; afterChange(); };
$('reset').onclick = () => { moves = []; selected = -1; anim = null; levelClean = false; afterChange(); };
$('solve').onclick = playSolution;
$('next').onclick = () => stage < set.stages.length ? startStage(stage + 1) : newIsland(!visiting);
// Att hoppa över en ö innan den är klar avslutar rundan och sparar den i topplistan.
// På en ö från en länk tar knappen spelaren tillbaka till sin egen ö.
$('new').onclick = () => {
  if (visiting) return newIsland();
  if (set && !cleared[set.stages.length] && run.score > 0) {
    lastEnded = endRun();
    showScore();
    newIsland(true, `Rundan slutade på ${lastEnded.score.toLocaleString('sv-SE')} poäng. Ny runda!`);
    return;
  }
  newIsland(true);
};
document.querySelectorAll('#count button').forEach(b => {
  b.onclick = () => { if (set && !playing && !b.disabled) startStage(+b.dataset.k); };
});
window.addEventListener('resize', resize);
// En länk som klistras in i adressfältet medan spelet är öppet
window.addEventListener('hashchange', () => {
  const link = linkFromHash();
  if (link && !(link.island === current && link.stage === stage)) newIsland(false, '', link);
});

// Dela nivån: telefonens delningsmeny om den finns, annars kopieras länken
$('shareBtn').onclick = async () => {
  const url = location.href, text = `Klarar du Ö ${current + 1}, nivå ${stage} i Bonway?`;
  try {
    if (navigator.share) await navigator.share({ title: 'Bonway', text, url });
    else { await navigator.clipboard.writeText(url); $('msg').textContent = 'Länken är kopierad.'; $('msg').className = 'ok'; }
  } catch {}
};

// ---------- Dialoger ----------

function renderTop() {
  $('topLead').textContent = `Rekord: ${record().toLocaleString('sv-SE')} poäng · Pågående runda: ${run.score.toLocaleString('sv-SE')}`;
  if (!topRuns.length) { $('topList').innerHTML = '<p class="lead">Inga avslutade rundor än. En runda slutar när du hoppar över en ö innan den är klar.</p>'; return; }
  const rows = topRuns.map((t, i) => `<tr class="${t === lastEnded ? 'latest' : ''}"><td>${i + 1}</td><td class="num">${t.score.toLocaleString('sv-SE')}</td><td class="num">${t.islands}</td><td class="num">${t.bestStreak}</td><td>${t.date}</td></tr>`);
  $('topList').innerHTML = `<table><tr><th>#</th><th class="num">Poäng</th><th class="num">Öar</th><th class="num">🔥</th><th>Datum</th></tr>${rows.join('')}</table>`;
}
$('topBtn').onclick = () => { renderTop(); $('topDialog').showModal(); };

// Musik och ljudeffekter stängs av och på var för sig
function showSoundButtons() {
  $('musicBtn').setAttribute('aria-pressed', sound.music);
  $('musicBtn').title = sound.music ? 'Stäng av musiken' : 'Slå på musiken';
  $('effectsBtn').setAttribute('aria-pressed', sound.effects);
  $('effectsBtn').title = sound.effects ? 'Stäng av ljudeffekterna' : 'Slå på ljudeffekterna';
}
$('musicBtn').onclick = () => { setMusic(!sound.music); showSoundButtons(); };
$('effectsBtn').onclick = () => { setEffects(!sound.effects); showSoundButtons(); };
showSoundButtons();

// Introt visas när sidan laddas och stängs med knappen, Esc eller ett klick utanför rutan
$('help').onclick = () => intro.showModal();
intro.addEventListener('click', e => {
  const r = intro.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) intro.close();
});
// Ön byggs upp när introt stängs, så att spelaren ser vågen
intro.addEventListener('close', () => {
  if (!set || calm || moves.length) return;
  reveal = performance.now();
  popAt = reveal + revealDuration() * 0.75;
});

// ---------- Start ----------

// Öarna i puzzles.json används i första hand. Saknas filen, eller är den gjord för en annan
// labyrintstorlek, skapas öarna direkt i webbläsaren i stället.
Promise.all([
  fetch('data/tiles.json').then(r => r.json()),
  fetch('data/puzzles.json').then(r => r.ok ? r.json() : []).catch(() => []),
  cityReady,
])
  .then(([tiles, saved]) => {
    initTiles(tiles);
    pool = saved.filter(o => deserialize(o));
    resize();
    newIsland(false, '', linkFromHash());
  })
  .catch(() => { $('msg').textContent = 'Kunde inte läsa in spelet. Ladda om sidan.'; $('msg').className = 'bad'; });

intro.showModal();
requestAnimationFrame(tick);
