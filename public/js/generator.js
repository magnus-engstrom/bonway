// Bonways labyrintgenerator: tiles, Wave Function Collapse, spelregler, lösare och banval.
// Används både av spelet i webbläsaren och av tools/pregenerate.cjs som skapar data/puzzles.json.

const TW = 2, TH = 2, T = 5;                // labyrinten är TW×TH tiles om T×T pixlar
const S = T - 1;                            // grannar delar kantpixlarna, så tiles ligger omlott med en pixel
const MW = TW * S + 1, MH = TH * S + 1;     // labyrintens storlek i pixlar
const W = MW + 2, H = MH + 2;              // +2 för ramen runt om
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // upp, höger, ned, vänster
const STEP = DIRS.map(([dx, dy]) => dx + dy * W);
const SOLVER_CAP = 200000;                  // max antal tillstånd innan lösaren ger upp
const MIN_MOVES = [0, 3, 6, 8];              // minsta optimala antal drag per antal linjer
const MIN_OPEN = 0.35;                      // minst så stor andel av labyrinten ska vara öppen och sammanhängande
const CANDIDATES = 30;                      // antal godkända banor att välja den svåraste bland
const GEN_BUDGET_MS = 600;                  // max tid för att leta kandidater
const MIN_DIST = 7;                         // minsta avstånd (i rutor) mellan en linjes startpunkt och utgång
const GOAL_SAMPLES = 60;                    // antal slumpade utgångskombinationer att pröva per uppsättning startpunkter
const REACH_CAP = 20000;                    // max antal tillstånd när en ensam linjes räckvidd räknas ut
const PLAYOUTS = 400;                       // slumpade spelomgångar per kandidat för att mäta svårighet
const OPENINGS = [0, 3, 3, 2];              // antal öppningar per färg (bara en är linjens bästa utgång)
const MAZE_POOL = 8;                        // antal labyrinter att välja den mest klassiska bland

let variants = [], compat = [];

// Läser in tiles.json-datan och räknar ut vilka varianter som får ligga bredvid varandra
function initTiles(tiles) {
  variants = buildVariants(tiles);
  // compat[d][a] = varianter som får ligga i riktning d från variant a
  compat = DIRS.map((_, d) => variants.map(a => variants.flatMap((b, j) => a.edges[d] === b.edges[(d + 2) % 4] ? [j] : [])));
}

// ---------- Tiles och Wave Function Collapse ----------

// Alla rotationer och speglingar av varje tile, utan dubbletter. Kanterna läses i samma riktning
// för motstående sidor så att två tiles passar ihop när kanterna är identiska.
function buildVariants(tiles) {
  const rot = r => r.map((_, x) => r.map(row => row[x]).reverse().join(''));
  const flip = r => r.map(row => [...row].reverse().join(''));
  const edges = r => { const col = x => r.map(row => row[x]).join(''); return [r[0], col(T - 1), r[T - 1], col(0)]; };
  const seen = new Set(), out = [];
  for (const t of tiles) {
    let r = t.rows; const mine = [];
    for (let i = 0; i < 4; i++, r = rot(r)) for (const v of [r, flip(r)]) {
      const key = v.join('');
      if (!seen.has(key)) { seen.add(key); mine.push({ name: t.name, rows: v, edges: edges(v) }); }
    }
    // Tiles med stora öppna ytor blir ovanligare så att labyrinten får fler gångar. Varje ursprungstile
    // väger lika mycket oavsett hur många unika varianter den har.
    // Klassiska labyrinter har smala gångar och tunna väggar, så både öppna ytor och massiva block straffas.
    const px = t.rows.map(row => [...row].map(ch => ch === '.' ? 0 : 1)).flat();
    const weight = t.name === 't1' ? 0 : 1 / (1 + wideCells(px, T, T) + blockCells(px, T, T, 1)) ** 2;
    mine.forEach(v => { v.weight = weight / mine.length; out.push(v); });
  }
  return out;
}

function wfc() {
  const n = variants.length, N = TW * TH;
  for (let attempt = 0; attempt < 100; attempt++) {
    const opts = Array.from({ length: N }, () => new Uint8Array(n).fill(1));
    const count = new Array(N).fill(n);
    let ok = true;
    const propagate = start => {
      const stack = [start];
      while (stack.length && ok) {
        const i = stack.pop(), x = i % TW, y = (i / TW) | 0;
        DIRS.forEach(([dx, dy], d) => {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= TW || ny >= TH) return;
          const j = ny * TW + nx, allowed = new Uint8Array(n);
          for (let a = 0; a < n; a++) if (opts[i][a]) for (const b of compat[d][a]) allowed[b] = 1;
          let changed = false;
          for (let b = 0; b < n; b++) if (opts[j][b] && !allowed[b]) { opts[j][b] = 0; count[j]--; changed = true; }
          if (count[j] === 0) ok = false; else if (changed) stack.push(j);
        });
      }
    };
    while (ok) {
      // Kollapsa cellen med lägst entropi (färst möjliga tiles), slumpa vid lika
      let best = -1, bestScore = Infinity;
      for (let i = 0; i < N; i++) if (count[i] > 1) {
        const s = count[i] + Math.random();
        if (s < bestScore) { bestScore = s; best = i; }
      }
      if (best < 0) break;
      let total = 0;
      for (let a = 0; a < n; a++) if (opts[best][a]) total += variants[a].weight;
      let r = Math.random() * total, pick = -1;
      for (let a = 0; a < n && r >= 0; a++) if (opts[best][a]) { r -= variants[a].weight; pick = a; }
      opts[best].fill(0); opts[best][pick] = 1; count[best] = 1;
      propagate(best);
    }
    if (ok) return opts.map(o => o.indexOf(1));
  }
  return null;
}

// Rutnät med 1 = vägg och 0 = öppet. Avskurna fickor fylls igen så att bara den största
// sammanhängande ytan finns kvar.
function buildMaze() {
  const picks = wfc();
  if (!picks) return null;
  const grid = new Uint8Array(W * H).fill(1);
  picks.forEach((v, i) => {
    const tx = i % TW, ty = (i / TW) | 0;
    variants[v].rows.forEach((row, y) => [...row].forEach((ch, x) => {
      grid[(ty * S + y + 1) * W + tx * S + x + 1] = ch === '.' ? 0 : 1;
    }));
  });
  const comp = new Int32Array(W * H).fill(-1), sizes = [];
  for (let s = 0; s < W * H; s++) if (!grid[s] && comp[s] < 0) {
    const id = sizes.length, stack = [s]; let size = 0; comp[s] = id;
    while (stack.length) {
      const p = stack.pop(); size++;
      for (const st of STEP) if (!grid[p + st] && comp[p + st] < 0) { comp[p + st] = id; stack.push(p + st); }
    }
    sizes.push(size);
  }
  if (!sizes.length) return null;
  const big = sizes.indexOf(Math.max(...sizes));
  if (sizes[big] < MIN_OPEN * MW * MH) return null;
  for (let p = 0; p < W * H; p++) if (!grid[p] && comp[p] !== big) grid[p] = 1;
  grid.score = wideCells(grid, W, H) / sizes[big] + blockCells(grid, W, H, 1) / (MW * MH);
  return grid;
}

// Bygger flera labyrinter och behåller den med smalast gångar och minst massiv vägg
function classicMaze() {
  let best = null;
  for (let tries = 0, found = 0; found < MAZE_POOL && tries < MAZE_POOL * 4; tries++) {
    const g = buildMaze();
    if (!g) continue;
    found++;
    if (!best || g.score < best.score) best = g;
  }
  return best;
}

// Antal helt öppna 2×2-rutor, dvs. ställen där gången är bredare än en pixel
function wideCells(grid, w, h) {
  let n = 0;
  for (let p = 0; p < w * (h - 1); p++) if (p % w < w - 1 && !grid[p] && !grid[p + 1] && !grid[p + w] && !grid[p + w + 1]) n++;
  return n;
}

// Antal celler med värdet v (0 = öppen, 1 = vägg) vars alla åtta grannar har samma värde,
// dvs. mitt i en öppen yta eller ett massivt väggblock
function blockCells(grid, w, h, v) {
  let n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    let same = true;
    for (let j = -1; j <= 1 && same; j++) for (let i = -1; i <= 1 && same; i++) if (grid[(y + j) * w + x + i] !== v) same = false;
    if (same) n++;
  }
  return n;
}

// Öppningar är ramceller (ej hörn) som gränsar till en öppen cell innanför ramen
function findOpenings(grid) {
  const out = [];
  for (let x = 1; x < W - 1; x++) {
    if (!grid[W + x]) out.push(x);
    if (!grid[(H - 2) * W + x]) out.push((H - 1) * W + x);
  }
  for (let y = 1; y < H - 1; y++) {
    if (!grid[y * W + 1]) out.push(y * W);
    if (!grid[y * W + W - 2]) out.push(y * W + W - 1);
  }
  return out;
}

// ---------- Regler ----------

// Varje linje börjar i en punkt inne i labyrinten (start) och ska ut genom någon av sina
// öppningar i ramen (exits). Ett drag är { li, d }.

// Cellerna en linje passerar när den glider i riktning d. Linjen stannar före väggar, linjer
// (även sin egen) och andra färgers öppningar, och glider ut när den når en egen öppning.
// exitOwner[p] är linjen som äger öppningen p, annars -1.
function slide(grid, blocked, exitOwner, li, from, d) {
  const cells = [];
  for (let p = from + STEP[d]; p >= 0 && p < W * H && !blocked(p); p += STEP[d]) {
    if (exitOwner[p] === li) { cells.push(p); break; }
    if (grid[p] || exitOwner[p] >= 0) break;
    cells.push(p);
  }
  return cells;
}

const isOut = (pz, li, head) => pz.exitOwner[head] === li;

// Spelets tillstånd efter en lista med drag
function stateFrom(pz, list) {
  const occ = new Uint8Array(W * H), trails = pz.lines.map(l => [l.start]);
  pz.lines.forEach(l => { occ[l.start] = 1; });
  for (const { li, d } of list) {
    const tr = trails[li];
    const cells = slide(pz.grid, p => occ[p], pz.exitOwner, li, tr[tr.length - 1], d);
    cells.forEach(p => { occ[p] = 1; tr.push(p); });
  }
  const done = trails.map((tr, i) => isOut(pz, i, tr[tr.length - 1]));
  return { occ, trails, done };
}

// Alla drag en linje kan göra från sitt huvud
function lineMoves(pz, blocked, li, head) {
  const out = [];
  for (let d = 0; d < 4; d++) {
    const cells = slide(pz.grid, blocked, pz.exitOwner, li, head, d);
    if (cells.length) out.push({ li, d, cells });
  }
  return out;
}

// Bredden-först-sökning över alla linjers gemensamma tillstånd, så att linjer som står i vägen för
// varandra räknas in. Ger kortaste lösningen, eller null om sökningen blir för stor.
// Med active löses bara de linjerna; övriga står kvar i sina startpunkter.
function solve(pz, active = pz.lines.map((_, i) => i)) {
  const words = Math.ceil(W * H / 32);
  const setBit = (o, p) => { o[p >> 5] |= 1 << (p & 31); };
  const startOcc = new Uint32Array(words), startHeads = pz.lines.map(l => l.start);
  startHeads.forEach(p => setBit(startOcc, p));
  const key = (h, o) => h.join(',') + '|' + o.join(',');
  const seen = new Map([[key(startHeads, startOcc), null]]);
  let frontier = [{ heads: startHeads, occ: startOcc, key: key(startHeads, startOcc) }];
  while (frontier.length) {
    const next = [];
    for (const st of frontier) {
      const blocked = p => (st.occ[p >> 5] >>> (p & 31)) & 1;
      for (const li of active) {
        if (isOut(pz, li, st.heads[li])) continue;
        for (const m of lineMoves(pz, blocked, li, st.heads[li])) {
          const occ = st.occ.slice(), heads = st.heads.slice();
          m.cells.forEach(p => setBit(occ, p));
          heads[li] = m.cells[m.cells.length - 1];
          const kk = key(heads, occ);
          if (seen.has(kk)) continue;
          seen.set(kk, { prev: st.key, li, d: m.d });
          if (active.every(i => isOut(pz, i, heads[i]))) {
            const path = []; let cur = kk;
            while (seen.get(cur)) { const e = seen.get(cur); path.unshift({ li: e.li, d: e.d }); cur = e.prev; }
            return path;
          }
          if (seen.size > SOLVER_CAP) return null;
          next.push({ heads, occ, key: kk });
        }
      }
    }
    frontier = next;
  }
  return null;
}

// ---------- Generering av bana ----------

const rand = n => Math.floor(Math.random() * n);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const dist = (a, b) => Math.abs(a % W - b % W) + Math.abs(((a / W) | 0) - ((b / W) | 0));

// Alla öppningar en linje kan nå från sin startpunkt om den vore ensam, med kortaste vägen dit:
// Map(öppning -> { moves, cells }). Andra linjers startpunkter är hinder.
function soloReach(grid, openings, starts, li) {
  const exitOwner = new Int8Array(W * H).fill(-1), occ = new Uint8Array(W * H);
  openings.forEach(o => { exitOwner[o] = li; });
  starts.forEach(s => { occ[s] = 1; });
  const reach = new Map(), seen = new Set();
  let frontier = [{ head: starts[li], trail: [starts[li]] }];
  for (let depth = 1; frontier.length && seen.size < REACH_CAP; depth++) {
    const next = [];
    for (const s of frontier) {
      const mine = new Set(s.trail);
      for (let d = 0; d < 4; d++) {
        const cells = slide(grid, p => occ[p] || mine.has(p), exitOwner, li, s.head, d);
        if (!cells.length) continue;
        const trail = [...s.trail, ...cells], head = trail[trail.length - 1];
        if (exitOwner[head] === li) {
          if (!reach.has(head)) reach.set(head, { moves: depth, cells: new Set(trail) });
          continue;
        }
        const key = trail.slice().sort((x, y) => x - y).join(',') + '|' + head;
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ head, trail });
      }
    }
    frontier = next;
  }
  return reach;
}

// Startpunkter spridda i labyrinten. Väljer sedan en utgång per linje så att linjernas självklara
// (kortaste) vägar korsar varandra, och lägger till fler öppningar som lockbeten, helst nära
// startpunkten. Lösaren avgör om banan går att klara och vilken utgång som är bäst.
function candidate(k, grid, openings) {
  const open = [];
  for (let p = 0; p < W * H; p++) if (!grid[p]) open.push(p);
  const starts = [];
  for (const c of shuffle(open)) {
    if (starts.every(s => dist(s, c) >= 5)) starts.push(c);
    if (starts.length === k) break;
  }
  if (starts.length < k) return null;

  const options = starts.map((s, li) => [...soloReach(grid, openings, starts, li)]
    .filter(([c]) => dist(s, c) >= MIN_DIST)
    .map(([cell, r]) => ({ cell, ...r })));
  if (options.some(o => !o.length)) return null;

  for (let sample = 0; sample < GOAL_SAMPLES; sample++) {
    const picks = options.map(o => o[rand(o.length)]);
    if (picks.some((a, i) => picks.some((b, j) => j > i && dist(a.cell, b.cell) < 3))) continue;
    // Med flera linjer krävs att minst två kortaste vägar korsar varandra
    if (k > 1 && !picks.some((a, i) => picks.some((b, j) => j > i && [...a.cells].some(c => b.cells.has(c))))) continue;

    // Lockbeten: lediga öppningar, helst nära startpunkten, och inte direkt intill en annan öppning
    const used = picks.map(p => p.cell), lines = [];
    for (let i = 0; i < k; i++) {
      const lure = [];
      for (const o of openings.slice().sort((a, b) => dist(a, starts[i]) - dist(b, starts[i]) + (Math.random() - 0.5) * 8)) {
        if (lure.length === OPENINGS[k] - 1) break;
        if (used.every(u => dist(u, o) >= 3)) { lure.push(o); used.push(o); }
      }
      lines.push({ start: starts[i], exits: [picks[i].cell, ...lure].sort((a, b) => a - b) });
    }
    const pz = withOwners({ grid, lines });
    const solution = solve(pz);
    if (!solution || solution.length < MIN_MOVES[k]) continue;
    pz.solution = solution;
    pz.limit = solution.length;
    return pz;
  }
  return null;
}

function withOwners(pz) {
  pz.exitOwner = new Int8Array(W * H).fill(-1);
  pz.lines.forEach((l, i) => l.exits.forEach(e => { pz.exitOwner[e] = i; }));
  return pz;
}

// Kortaste vägen för en linje om den vore ensam
function soloPath(pz, i) {
  const path = solve(pz, [i]);
  return path ? { moves: path.length, cells: new Set(stateFrom(pz, path).trails[i]) } : { moves: 0, cells: new Set() };
}

// Svårt = att en spelare som provar sig fram sällan lyckas, att linjernas självklara vägar korsar
// varandra så att någon linje måste ta en omväg, och att det krävs många drag.
function difficulty(pz) {
  const luck = randomSuccess(pz, PLAYOUTS);
  const solos = pz.lines.map((_, i) => soloPath(pz, i));
  let crossings = 0;
  for (let i = 0; i < solos.length; i++) for (let j = i + 1; j < solos.length; j++)
    if ([...solos[i].cells].some(c => solos[j].cells.has(c))) crossings++;
  const detour = pz.limit - solos.reduce((sum, s) => sum + s.moves, 0);
  const trails = stateFrom(pz, pz.solution).trails;
  const spread = trails.reduce((sum, tr) => sum + dist(tr[0], tr[tr.length - 1]), 0) / trails.length;
  const score = -40 * Math.log10(Math.max(luck, 1 / PLAYOUTS / 2)) + spread / 2 + pz.limit + 5 * crossings + 5 * detour;
  return { score, luck, crossings, detour, spread };
}

// Andel av n spelomgångar där en spelare som väljer slumpmässiga drag klarar banan inom
// dragbegränsningen. Låg andel = få vägar fram och många fällor.
function randomSuccess(pz, n) {
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const occ = new Uint8Array(W * H), heads = pz.lines.map(l => l.start);
    heads.forEach(p => { occ[p] = 1; });
    for (let m = 0; m < pz.limit; m++) {
      const opts = [];
      heads.forEach((h, li) => { if (!isOut(pz, li, h)) opts.push(...lineMoves(pz, p => occ[p], li, h)); });
      if (!opts.length) break;
      const o = opts[rand(opts.length)];
      o.cells.forEach(p => { occ[p] = 1; });
      heads[o.li] = o.cells[o.cells.length - 1];
    }
    if (heads.every((h, li) => isOut(pz, li, h))) wins++;
  }
  return wins / n;
}

// En bana spelas i steg på samma labyrint: först med en linje, sedan två, sedan alla.
// Steg s använder de s första linjerna. Att ta bort en linje kan göra banan olöslig (linjer är också
// stopp), så varje steg löses för sig. Alla ordningar prövas och den där steg 2 är svårast väljs.
function withStages(pz) {
  const n = pz.lines.length, cache = new Map();
  const stageOf = idx => {
    const key = idx.join(',');
    if (!cache.has(key)) {
      const sp = withOwners({ grid: pz.grid, lines: idx.map(i => pz.lines[i]) });
      const solution = solve(sp);
      cache.set(key, solution && solution.length >= MIN_MOVES[idx.length] ? { limit: solution.length, solution, sp } : null);
    }
    return cache.get(key);
  };
  const perms = [[]];
  for (let i = 0; i < n; i++) perms.splice(0, perms.length, ...perms.flatMap(p => [...Array(n).keys()].filter(x => !p.includes(x)).map(x => [...p, x])));
  let best = null;
  for (const order of perms) {
    // Ordningen inom steget spelar ingen roll för lösbarheten, bara vilka linjer som är med
    const stages = order.map((_, s) => stageOf(order.slice(0, s + 1).sort((x, y) => x - y)));
    if (stages.some(s => !s)) continue;
    const score = n > 1 ? -Math.log10(Math.max(randomSuccess(stages[1].sp, PLAYOUTS / 2), 1 / PLAYOUTS)) : 0;
    if (!best || score > best.score) best = { order, score };
  }
  if (!best) return null;
  // Byt ordning på linjerna och räkna om stegens lösningar till de nya linjenumren
  const lines = best.order.map(i => pz.lines[i]);
  const stages = best.order.map((_, s) => {
    const idx = best.order.slice(0, s + 1).sort((x, y) => x - y), st = stageOf(idx);
    return { limit: st.limit, solution: st.solution.map(m => ({ li: best.order.indexOf(idx[m.li]), d: m.d })) };
  });
  return { grid: pz.grid, lines, stages, score: best.score };
}

// Spelbar bana för steg s (1 = en linje)
function stagePuzzle(set, s) {
  return withOwners({ grid: set.grid, lines: set.lines.slice(0, s), limit: set.stages[s - 1].limit, solution: set.stages[s - 1].solution });
}

// Skapar flera godkända banor och behåller den svåraste
function generate(k = 3, { candidates = CANDIDATES, budget = GEN_BUDGET_MS } = {}) {
  let grid = null, openings = [], best = null;
  const t0 = performance.now();
  for (let tries = 0, found = 0; tries < 50 * candidates && found < candidates && performance.now() - t0 < budget; tries++) {
    if (tries % 25 === 0 || !grid) {
      grid = classicMaze();
      if (!grid) continue;
      openings = findOpenings(grid);
    }
    const pz = candidate(k, grid, openings);
    if (!pz) continue;
    const set = withStages(pz);
    if (!set) continue;
    found++;
    set.difficulty = difficulty(stagePuzzle(set, k)).score + 20 * set.score;
    if (!best || set.difficulty > best.difficulty) best = set;
  }
  return best;
}

// Banor sparas kompakt i puzzles.json; rutnätet som en sträng med 0 (öppet) och 1 (vägg)
function serialize(set) {
  return {
    w: W, h: H, grid: set.grid.join(''), lines: set.lines,
    stages: set.stages.map(s => ({ limit: s.limit, solution: s.solution.map(m => [m.li, m.d]) })),
  };
}

function deserialize(o) {
  if (o.w !== W || o.h !== H || !o.stages) return null;
  return {
    grid: Uint8Array.from(o.grid, ch => +ch), lines: o.lines,
    stages: o.stages.map(s => ({ limit: s.limit, solution: s.solution.map(([li, d]) => ({ li, d })) })),
  };
}

if (typeof module !== 'undefined') module.exports = { initTiles, generate, serialize, deserialize, stagePuzzle, solve, stateFrom, randomSuccess };
