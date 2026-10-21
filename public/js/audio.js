// Ljud: bakgrundsmusik i loop på låg volym och korta ljudeffekter. Webbläsare tillåter ljud först
// efter att spelaren har klickat eller tryckt på en tangent, så ljudet startar vid första
// interaktionen. Musik och ljudeffekter kan stängas av var för sig, och valet sparas.
// Kräver store från score.js.

const SOUNDS = {
  engine: 'audio/engine.m4a',            // en bil kör iväg (klippt till två sekunder)
  point: 'audio/point.m4a',              // en bil når sin lastzon
  level: 'audio/level-complete.m4a',     // en nivå är klar
  island: 'audio/island-complete.m4a',   // hela ön är klar
};
const VOLUME = { music: 0.18, engine: 0.35, point: 0.55, level: 0.6, island: 0.65 };

const sound = {
  music: store.get('bonway.music', true),
  effects: store.get('bonway.effects', true),
  ctx: null, buffers: {}, engine: null,
  track: null, // musiken strömmas i stället för att avkodas, eftersom låten är lång
};

function unlockAudio() {
  if (sound.ctx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (Ctx) {
    sound.ctx = new Ctx();
    for (const [name, src] of Object.entries(SOUNDS)) {
      fetch(src).then(r => r.arrayBuffer()).then(b => sound.ctx.decodeAudioData(b))
        .then(buf => { sound.buffers[name] = buf; }).catch(() => {});
    }
  }
  sound.track = new Audio('audio/music.m4a');
  sound.track.loop = true;
  sound.track.volume = VOLUME.music;
  if (sound.music) sound.track.play().catch(() => {});
}
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

// Spelar en ljudeffekt, eventuellt med fördröjning så att den hamnar när en animation når fram
function playSound(name, delayMs = 0) {
  const ctx = sound.ctx, buf = sound.buffers[name];
  if (!sound.effects || !ctx || !buf) return;
  if (ctx.state === 'suspended') ctx.resume();
  const src = ctx.createBufferSource(), gain = ctx.createGain();
  src.buffer = buf;
  gain.gain.value = VOLUME[name];
  src.connect(gain).connect(ctx.destination);
  // Bara en motor åt gången, så att snabba drag inte bygger upp ett brus
  if (name === 'engine') {
    if (sound.engine) try { sound.engine.stop(); } catch {}
    sound.engine = src;
  }
  src.start(ctx.currentTime + delayMs / 1000);
}

function setMusic(on) {
  sound.music = on;
  store.set('bonway.music', on);
  if (sound.track) on ? sound.track.play().catch(() => {}) : sound.track.pause();
}

function setEffects(on) {
  sound.effects = on;
  store.set('bonway.effects', on);
  if (!on && sound.engine) try { sound.engine.stop(); } catch {}
}
