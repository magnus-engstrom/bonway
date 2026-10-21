// Animationer: ön byggs upp i en våg när en karta laddas, bilarna studsar fram och det blir
// konfetti och en skylt när en nivå klaras. Kräver W och H från generator.js.

const easeOutBack = t => { const k = 1.6; return 1 + (k + 1) * (t - 1) ** 3 + k * (t - 1) ** 2; };
const clamp01 = t => Math.max(0, Math.min(1, t));

const REVEAL_CELL_MS = 380; // hur länge en ruta tar på sig att växa fram
const REVEAL_STEP_MS = 55;  // fördröjning per rutas avstånd från mitten
const revealDuration = () => Math.hypot((W - 1) / 2, (H - 1) / 2) * REVEAL_STEP_MS + REVEAL_CELL_MS;

// Ritar stadsbilden ruta för ruta i en våg från mitten och utåt. Ger true när vågen är klar.
function drawReveal(c, layer, cell, dpr, t0, now) {
  const mx = (W - 1) / 2, my = (H - 1) / 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = clamp01((now - t0 - Math.hypot(x - mx, y - my) * REVEAL_STEP_MS) / REVEAL_CELL_MS);
    if (!t) continue;
    const size = cell * (0.35 + 0.65 * easeOutBack(t)), off = (cell - size) / 2;
    c.globalAlpha = clamp01(t * 2);
    c.drawImage(layer, x * cell * dpr, y * cell * dpr, cell * dpr, cell * dpr, x * cell + off, y * cell + off, size, size);
  }
  c.globalAlpha = 1;
  return now - t0 > revealDuration();
}

// Storlek 0–1 för bil nummer i när bilarna studsar fram med start vid t0
const VAN_POP_MS = 420, VAN_POP_STAGGER = 130;
function vanPop(i, t0, now) {
  return easeOutBack(clamp01((now - t0 - i * VAN_POP_STAGGER) / VAN_POP_MS));
}

// Konfetti som skjuts upp från punkterna [x, y, färg] med start vid t0. Partiklarna följer en
// kastbana, så läget räknas fram ur tiden i stället för att uppdateras steg för steg.
function spawnConfetti(list, points, cell, t0) {
  for (const [x, y, color] of points) for (let i = 0; i < 36; i++) {
    list.push({
      x, y, t0: t0 + Math.random() * 120,
      vx: (Math.random() - 0.5) * cell * 0.014, vy: -(0.006 + Math.random() * 0.013) * cell,
      g: cell * 0.000032, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.02,
      size: cell * (0.08 + Math.random() * 0.07), life: 1300 + Math.random() * 800,
      color: Math.random() < 0.6 ? color : Math.random() < 0.5 ? '#ffffff' : '#f2c14e',
    });
  }
}

function drawConfetti(c, list, now) {
  for (let i = list.length - 1; i >= 0; i--) if (now - list[i].t0 > list[i].life) list.splice(i, 1);
  for (const p of list) {
    const t = now - p.t0;
    if (t < 0) continue;
    c.save();
    c.globalAlpha = t > p.life * 0.7 ? 1 - (t - p.life * 0.7) / (p.life * 0.3) : 1;
    c.translate(p.x + p.vx * t, p.y + p.vy * t + 0.5 * p.g * t * t);
    c.rotate(p.rot + p.vr * t);
    c.fillStyle = p.color;
    c.fillRect(-p.size / 2, -p.size * 0.28, p.size, p.size * 0.55);
    c.restore();
  }
}

// Skylt mitt på planen som studsar fram, står kvar en stund och tonar bort. Ger false när den är klar.
const BANNER_MS = 2000;
function drawBanner(c, banner, now, cell) {
  const t = now - banner.t0;
  if (t < 0) return true;
  if (t > BANNER_MS) return false;
  const scale = easeOutBack(clamp01(t / 380)), fade = clamp01((BANNER_MS - t) / 400);
  c.save();
  c.translate(W * cell / 2, H * cell / 2); c.scale(scale, scale);
  c.globalAlpha = fade;
  c.font = `700 ${Math.round(cell * 0.62)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const subFont = `600 ${Math.round(cell * 0.32)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  let w = c.measureText(banner.text).width;
  if (banner.sub) { c.font = subFont; w = Math.max(w, c.measureText(banner.sub).width); c.font = `700 ${Math.round(cell * 0.62)}px system-ui, -apple-system, "Segoe UI", sans-serif`; }
  w += cell * 1.2;
  const h = cell * (banner.sub ? 1.6 : 1.15);
  c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = cell * 0.4; c.shadowOffsetY = cell * 0.08;
  c.fillStyle = 'rgba(18,23,34,.9)';
  c.beginPath(); c.roundRect(-w / 2, -h / 2, w, h, h / 2); c.fill();
  c.shadowColor = 'transparent';
  c.strokeStyle = '#f2c14e'; c.lineWidth = 2; c.stroke();
  // Rubrik, och poängraden under om det finns en
  c.fillStyle = '#fff'; c.fillText(banner.text, 0, banner.sub ? -cell * 0.2 : cell * 0.03);
  if (banner.sub) { c.font = subFont; c.fillStyle = '#f2c14e'; c.fillText(banner.sub, 0, cell * 0.38); }
  c.restore();
  return true;
}
