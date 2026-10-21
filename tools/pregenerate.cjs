// Skapar public/data/puzzles.json med färdiga öar så att spelet slipper generera dem i webbläsaren.
// Varje bana är en ö med tre linjer som spelas i tre nivåer: en, två och tre bilar.
// Alla spelar öarna i samma ordning: de första följer en fast svårighetskurva (ö 3 är ganska svår),
// resten blandas med ett fast frö. Svårigheten sparas i varje ö som fältet d.
// Kör: npm run pregenerate -- [antal öar, standard 100]
//      npm run sort-islands           ordnar om befintliga öar utan att skapa nya
const fs = require('fs'), path = require('path');
const { initTiles, generate, serialize, deserialize, stagePuzzle, randomSuccess } = require('../public/js/generator.js');

const DATA = path.join(__dirname, '..', 'public', 'data');
const FILE = path.join(DATA, 'puzzles.json');
initTiles(JSON.parse(fs.readFileSync(path.join(DATA, 'tiles.json'))));

// Svårighet: hur sällan en spelare som provar sig fram klarar nivå 3 (och till hälften nivå 2),
// plus lite för antalet drag på nivå 3
function difficulty(o) {
  const set = deserialize(o), hard = luck => -Math.log10(Math.max(luck, 1e-4));
  const two = stagePuzzle(set, 2), three = stagePuzzle(set, 3);
  return hard(randomSuccess(three, 3000)) + 0.5 * hard(randomSuccess(two, 3000)) + 0.05 * three.limit;
}

// Svårighet för de första öarna, som andel av öarna som är lättare (0 = lättast, 1 = svårast)
const OPENING = [0, 0.1, 0.75, 0.3, 0.5];
const SHUFFLE_SEED = 2026;

function arrange(list) {
  list.forEach((o, i) => {
    process.stdout.write(`\rMäter svårighet: ${i + 1}/${list.length}`);
    if (o.d === undefined) o.d = +difficulty(o).toFixed(3);
  });
  console.log();
  // Lika svåra öar ordnas efter rutnätet, så att resultatet inte beror på hur filen låg innan
  const rest = list.slice().sort((a, b) => a.d - b.d || (a.grid < b.grid ? -1 : a.grid > b.grid ? 1 : 0));
  const first = OPENING.map(q => rest.splice(Math.round(q * (rest.length - 1)), 1)[0]);
  // Fast frö så att ordningen blir densamma varje gång skriptet körs
  let seed = SHUFFLE_SEED;
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  return [...first, ...rest];
}

let out;
if (process.argv[2] === '--sort') {
  out = JSON.parse(fs.readFileSync(FILE));
} else {
  const COUNT = +process.argv[2] || 100, t0 = Date.now();
  out = [];
  for (let i = 0; i < COUNT; i++) {
    // Här finns tid att välja bland fler kandidater än i webbläsaren, vilket ger svårare banor
    const set = generate(3, { candidates: 60, budget: 8000 });
    if (set) out.push(serialize(set));
    process.stdout.write(`\rBanor: ${i + 1}/${COUNT}`);
  }
  console.log(` (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
out = arrange(out);
fs.writeFileSync(FILE, JSON.stringify(out));
console.log(`${out.length} banor -> puzzles.json. Svårighet för de första tio: ${out.slice(0, 10).map(o => o.d.toFixed(1)).join(', ')}`);
