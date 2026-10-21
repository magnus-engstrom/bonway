// Stadsgrafik: spelet utspelar sig på en ö. Labyrintens gångar är gator, väggarna är gräsmattor med
// enstaka hus och träd, ramen är hav och utgångarna är pirar med lastzoner. Bilarna är linjernas huvuden.
// Kräver W, H och DIRS från generator.js.
//
// Marken ritas med två hörnbaserade tileset (dual grid): varje tile ligger över en punkt där fyra
// labyrintrutor möts, och de fyra rutornas markyta väljer tile. Kanterna hamnar då mitt i tilen och
// kan vara rundade. Arken har 4×4 tiles om 256 px där index = TL + 2·TR + 4·BL + 8·BR.

const SHEETS = {
  a: 'assets/props-a.png',      // tak och grönska
  g: 'assets/ground.png',       // fristående hus och träd
  b: 'assets/props-b.png',      // fontän, damm, lekplats
  dc: 'assets/dual-coast.png',  // hav (1) mot asfalt (0) med kaj
  dg: 'assets/dual-grass.png',  // gräs (1) mot inget (0); magenta bakgrund blir genomskinlig
  v: 'assets/vans.png',         // leveransbilar: rader gul, blå, röd; kolumner upp, höger, ned, vänster
};
const DUAL = 256;

// Färgjustering per ark när bilderna laddas: [mättnad, ljushet, kontrast, gråljus]; 1 = oförändrat.
// Gråljus gör bara gråa ytor (asfalten) ljusare, så att havet i samma ark inte påverkas.
const GRADE = {
  dc: [1.25, 1.05, 1.03, 1.45], // hav och asfalt
  dg: [1.18, 1.07, 1.03],       // gräs
  a: [1.1, 1.04, 1.02], g: [1.1, 1.04, 1.02], b: [1.1, 1.04, 1.02], // hus, träd och annat på gräset
};

// [ark, x, y, b, h] i källbilden
const SPRITES = {
  houseBeige: ['g', 48, 684, 225, 189], houseRed: ['g', 354, 681, 237, 195], tree: ['g', 660, 645, 258, 267],
  roofBeige: ['a', 48, 48, 249, 252], roofRed: ['a', 345, 45, 264, 255], roofGreen: ['b', 339, 33, 273, 276], roofVents: ['b', 957, 36, 270, 270],
  treeBox: ['a', 339, 330, 276, 282], flowerBed: ['a', 648, 351, 267, 261],
  fountain: ['b', 36, 36, 273, 273], sandbox: ['b', 33, 339, 273, 273], pond: ['b', 645, 342, 279, 270], playground: ['b', 957, 333, 276, 279], cafe: ['b', 651, 636, 270, 267],
};
const VAN_ROW = [2, 1, 0]; // linje 0 är röd, 1 blå, 2 gul
const VAN_BOX = [[75, 51, 222, 294], [381, 90, 333, 216], [795, 51, 222, 294], [1092, 90, 330, 216]];
const VAN_ROW_Y = [0, 333, 669];

// Vad som står på gräsrutorna; resten av rutorna är tom gräsmatta. [föremål, vikt, marginal]
const LAWN = [
  ['houseBeige', 6, 0.14], ['houseRed', 6, 0.14], ['roofBeige', 2, 0.18], ['roofRed', 2, 0.18], ['roofGreen', 2, 0.18], ['roofVents', 1, 0.18],
  ['tree', 6, 0.1], ['treeBox', 1, 0.16], ['flowerBed', 1, 0.18],
  ['fountain', 0.5, 0.16], ['pond', 0.5, 0.14], ['playground', 0.5, 0.16], ['sandbox', 0.5, 0.18], ['cafe', 0.5, 0.16],
];
const LAWN_EMPTY = 0.4; // andel gräsrutor utan föremål

const images = {};
const cityReady = Promise.all(Object.entries(SHEETS).map(([k, src]) => new Promise(resolve => {
  const img = new Image();
  img.onload = () => {
    let src = img;
    if (k === 'dg') src = keyMagenta(src);
    if (GRADE[k]) src = grade(src, ...GRADE[k]);
    // Hörnbaserade ark delas upp i egna bilder så att grannar i arket inte blöder in vid skalning
    images[k] = k === 'dc' || k === 'dg' ? sliceDual(src) : src;
    resolve();
  };
  img.onerror = resolve; // utan bild ritas en enkel färgyta i stället
  img.src = src;
})));

// Piggare färger: mättnad runt pixelns gråvärde, kontrast runt mellangrått och sedan ljushet.
// grayLift ljusar upp pixlar med lite färg (gråa ytor) extra, med mjuk övergång mot färgade pixlar.
function grade(img, sat, bright, contrast, grayLift = 1) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height), px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const chroma = Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2]);
    const lift = 1 + (grayLift - 1) * Math.max(0, 1 - chroma / 40);
    for (let k = 0; k < 3; k++) px[i + k] = ((lum + (px[i + k] - lum) * sat - 128) * contrast + 128) * bright * lift;
  }
  g.putImageData(data, 0, 0);
  return c;
}

// Gör magenta (#FF00FF) genomskinligt. Kantpixlar som är en blandning av magenta och motiv får
// delvis genomskinlighet och magentan räknas bort ur färgen, så att inga rosa kanter blir kvar.
function keyMagenta(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height), px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], gr = px[i + 1], b = px[i + 2];
    const m = Math.max(0, Math.min(r, b) - gr) / 255; // hur mycket magenta pixeln innehåller
    if (m <= 0.05) continue;
    if (m >= 0.9) { px[i + 3] = 0; continue; }
    px[i] = (r - 255 * m) / (1 - m); px[i + 1] = gr / (1 - m); px[i + 2] = (b - 255 * m) / (1 - m);
    px[i + 3] = 255 * (1 - m);
  }
  g.putImageData(data, 0, 0);
  return c;
}

function sliceDual(sheet) {
  return Array.from({ length: 16 }, (_, i) => {
    const c = document.createElement('canvas');
    c.width = c.height = DUAL;
    c.getContext('2d').drawImage(sheet, (i % 4) * DUAL, (i >> 2) * DUAL, DUAL, DUAL, 0, 0, DUAL, DUAL);
    return c;
  });
}

// Deterministisk slump så att samma labyrint alltid ser likadan ut
function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const onFrame = p => p % W === 0 || p % W === W - 1 || p < W || p >= W * (H - 1);

// Föremål för varje gräsruta: { name, pad } eller null. Grannar får inte samma föremål.
function lawnLayout(grid) {
  let seed = 7;
  for (let i = 0; i < grid.length; i++) seed = (Math.imul(seed, 31) + grid[i]) | 0;
  const rnd = seededRandom(seed), total = LAWN.reduce((s, l) => s + l[1], 0);
  const out = new Array(W * H).fill(null);
  for (let p = 0; p < W * H; p++) {
    if (!grid[p] || onFrame(p) || rnd() < LAWN_EMPTY) continue;
    const near = [out[p - 1], out[p - W]].map(o => o && o.name);
    for (let i = 0; i < 4; i++) {
      let r = rnd() * total, item = LAWN[0];
      for (item of LAWN) if ((r -= item[1]) < 0) break;
      out[p] = { name: item[0], pad: item[2] };
      if (!near.includes(item[0])) break;
    }
  }
  return out;
}

// Ljuset faller snett uppifrån vänster, så skuggor hamnar snett nedåt höger
const LIGHT = { dx: 0.07, dy: 0.09, blur: 0.08, alpha: 0.38 };

// Ritar ett föremål centrerat i rutan med bibehållna proportioner och en mjuk skugga
function drawProp(c, name, x, y, size, padding) {
  const spr = SPRITES[name], img = images[spr[0]], pad = size * padding, room = size - pad * 2;
  const k = room / Math.max(spr[3], spr[4]), w = spr[3] * k, h = spr[4] * k;
  if (!img) return;
  c.save();
  c.shadowColor = `rgba(10,20,10,${LIGHT.alpha})`; c.shadowBlur = size * LIGHT.blur;
  c.shadowOffsetX = size * LIGHT.dx; c.shadowOffsetY = size * LIGHT.dy;
  c.drawImage(img, spr[1], spr[2], spr[3], spr[4], x + (size - w) / 2, y + (size - h) / 2, w, h);
  c.restore();
}

// Ritar ett hörnbaserat lager: is(x, y) säger om rutan har lagrets markyta. Rutor utanför planen
// frågas också, så att havet fortsätter ut över kanten. Helt enhetliga tiles (bara asfalt, hav eller
// gräs) roteras och speglas slumpmässigt per position så att mönstret inte upprepas synligt.
function drawDual(g, sheet, is, cell, fallback) {
  const tiles = images[sheet];
  for (let vy = 0; vy <= H; vy++) for (let vx = 0; vx <= W; vx++) {
    const i = is(vx - 1, vy - 1) | is(vx, vy - 1) << 1 | is(vx - 1, vy) << 2 | is(vx, vy) << 3;
    if (!i && sheet === 'dg') continue; // helt tom gräs-tile
    const x = (vx - 0.5) * cell, y = (vy - 0.5) * cell;
    if (tiles) {
      g.save();
      g.translate(x + cell / 2, y + cell / 2);
      if (i === 0 || i === 15) {
        const r = seededRandom(vx * 92821 + vy * 68917 + i)();
        g.rotate(Math.floor(r * 4) * Math.PI / 2);
        if (r * 8 % 2 >= 1) g.scale(-1, 1);
      }
      // Lite överlapp så att det inte blir hårfina glipor mellan tiles
      g.drawImage(tiles[i], -cell / 2 - 0.25, -cell / 2 - 0.25, cell + 0.5, cell + 0.5);
      g.restore();
    } else if (fallback) {
      // Utan bild: färga kvartsrutorna efter hörnen
      [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([qx, qy], k) => {
        const col = fallback[i >> k & 1];
        if (col) { g.fillStyle = col; g.fillRect(x + qx * cell / 2, y + qy * cell / 2, cell / 2 + 0.5, cell / 2 + 0.5); }
      });
    }
  }
}

// Statisk bild av ön för en bana: hav, kaj, gator, gräsmattor med hus och pirar med lastzoner
// (utan rutter och bilar). Bara stegets utgångar blir pirar; övriga ramrutor är hav.
function renderCity(pz, cell, dpr) {
  const c = document.createElement('canvas');
  c.width = W * cell * dpr; c.height = H * cell * dpr;
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.imageSmoothingQuality = 'high';
  const exits = new Map();
  pz.lines.forEach((l, i) => l.exits.forEach(e => exits.set(e, i)));
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const water = (x, y) => !inside(x, y) || (onFrame(y * W + x) && !exits.has(y * W + x));
  const grass = (x, y) => inside(x, y) && !onFrame(y * W + x) && pz.grid[y * W + x] === 1;

  drawDual(g, 'dc', (x, y) => water(x, y) ? 1 : 0, cell, ['#3a3b3d', '#1d5f6b']);
  // Gräset ritas först till ett eget lager och får sedan en svag skugga som helhet, så att
  // gräsmattorna ser lite upphöjda ut utan att skarvarna mellan tiles skuggar varandra
  const lawnLayer = document.createElement('canvas');
  lawnLayer.width = c.width; lawnLayer.height = c.height;
  const lg = lawnLayer.getContext('2d');
  lg.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawDual(lg, 'dg', (x, y) => grass(x, y) ? 1 : 0, cell, [null, '#4c8a3a']);
  g.save();
  g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = cell * 0.06;
  g.shadowOffsetX = cell * 0.025; g.shadowOffsetY = cell * 0.035;
  g.drawImage(lawnLayer, 0, 0, W * cell, H * cell);
  g.restore();

  const lawn = lawnLayout(pz.grid);
  for (let p = 0; p < W * H; p++) if (lawn[p]) drawProp(g, lawn[p].name, p % W * cell, ((p / W) | 0) * cell, cell, lawn[p].pad);

  // Ljussättning: varmt ljus uppifrån vänster, svalare skugga nere till höger och mörkare kanter
  const light = g.createLinearGradient(0, 0, W * cell, H * cell);
  light.addColorStop(0, 'rgba(255,232,180,.16)');
  light.addColorStop(0.5, 'rgba(255,255,255,0)');
  light.addColorStop(1, 'rgba(8,24,52,.2)');
  g.fillStyle = light; g.fillRect(0, 0, W * cell, H * cell);
  const vignette = g.createRadialGradient(W * cell / 2, H * cell / 2, W * cell * 0.35, W * cell / 2, H * cell / 2, W * cell * 0.75);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,.28)');
  g.fillStyle = vignette; g.fillRect(0, 0, W * cell, H * cell);

  // Lastzoner: randig yta i linjens färg ute på piren
  for (const [e, i] of exits) {
    const x = e % W * cell, y = ((e / W) | 0) * cell, inset = cell * 0.16, s = cell - inset * 2;
    g.save();
    g.beginPath(); g.roundRect(x + inset, y + inset, s, s, cell * 0.08); g.clip();
    g.globalAlpha = 0.9; g.fillStyle = COLORS[i]; g.fillRect(x, y, cell, cell);
    g.globalAlpha = 0.4; g.strokeStyle = '#fff'; g.lineWidth = cell * 0.07;
    for (let k = -cell; k < cell * 2; k += cell * 0.25) { g.beginPath(); g.moveTo(x + k, y); g.lineTo(x + k - cell, y + cell); g.stroke(); }
    g.restore();
  }
  return c;
}

// Havsrutor (ramen utom stegets pirar) där vattnet kan blänka
function waterCells(pz) {
  const exits = new Set(pz.lines.flatMap(l => l.exits)), out = [];
  for (let p = 0; p < W * H; p++) if (onFrame(p) && !exits.has(p)) out.push(p);
  return out;
}

// Blänk i vattnet: korta ljusglimtar som tänds och slocknar på slumpmässiga ställen.
// Varje blänk är { x, y, t0, dur, len } i pixlar och millisekunder.
const SPARKLE_DENSITY = 0.12; // antal samtidiga blänk per havsruta
function updateSparkles(list, cells, cell, now) {
  for (let i = list.length - 1; i >= 0; i--) if (now - list[i].t0 > list[i].dur) list.splice(i, 1);
  const want = Math.round(cells.length * SPARKLE_DENSITY);
  while (list.length < want && cells.length) {
    const p = cells[Math.floor(Math.random() * cells.length)];
    list.push({
      // Håll blänket inne i rutan, en bit från kajkanten
      x: (p % W + 0.2 + Math.random() * 0.6) * cell, y: (((p / W) | 0) + 0.2 + Math.random() * 0.6) * cell,
      t0: now + Math.random() * 1500, dur: 900 + Math.random() * 1100, len: cell * (0.08 + Math.random() * 0.12),
    });
  }
}

function drawSparkles(c, list, now) {
  c.save();
  c.lineCap = 'round'; c.shadowColor = 'rgba(255,255,255,.9)';
  for (const s of list) {
    const t = (now - s.t0) / s.dur;
    if (t < 0 || t > 1) continue;
    const a = Math.sin(t * Math.PI); // tänds och slocknar mjukt
    c.globalAlpha = a * 0.85; c.strokeStyle = '#fff'; c.shadowBlur = s.len * 0.8;
    c.lineWidth = Math.max(1, s.len * 0.18);
    c.beginPath(); c.moveTo(s.x - s.len * a, s.y); c.lineTo(s.x + s.len * a, s.y); c.stroke();
    c.lineWidth = Math.max(0.8, s.len * 0.1);
    c.beginPath(); c.moveTo(s.x, s.y - s.len * 0.45 * a); c.lineTo(s.x, s.y + s.len * 0.45 * a); c.stroke();
  }
  c.restore();
}

// Leveransbil för linje li, centrerad i (x, y) och vänd i riktning d. En vald bil får ett ljust sken.
// shake (0–1) får bilen att skaka lite som en motor på tomgång.
function drawVan(c, li, d, x, y, cell, glow = false, shake = 0, now = 0) {
  const [sx, sy, sw, sh] = VAN_BOX[d], k = cell * 0.86 / Math.max(sw, sh);
  const w = sw * k, h = sh * k, oy = VAN_ROW_Y[VAN_ROW[li]];
  if (shake) {
    // Några sinusvågor med olika takt ger en oregelbunden men mjuk vibration
    x += (Math.sin(now * 0.071) + Math.sin(now * 0.113) * 0.5) * cell * 0.006 * shake;
    y += (Math.sin(now * 0.089) + Math.sin(now * 0.137) * 0.5) * cell * 0.006 * shake;
  }
  if (images.v) {
    c.save();
    if (shake) {
      c.translate(x, y); c.rotate(Math.sin(now * 0.097) * 0.01 * shake); c.translate(-x, -y);
    }
    if (glow) {
      // Skenet ritas med bilen själv som form, två gånger för att bli tydligt men mjukt
      c.shadowColor = 'rgba(255,250,220,.95)'; c.shadowBlur = cell * 0.35;
      c.drawImage(images.v, sx, sy + oy, sw, sh, x - w / 2, y - h / 2, w, h);
    }
    c.shadowColor = glow ? 'rgba(255,250,220,.8)' : 'rgba(0,0,0,.45)';
    c.shadowBlur = cell * (glow ? 0.2 : 0.15); c.shadowOffsetY = glow ? 0 : cell * 0.05;
    c.drawImage(images.v, sx, sy + oy, sw, sh, x - w / 2, y - h / 2, w, h);
    c.restore();
  } else {
    c.fillStyle = COLORS[li]; c.fillRect(x - w / 2, y - h / 2, w, h);
  }
}
