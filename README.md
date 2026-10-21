# Bonway

Ett pusselspel om leveranser på en ö. Varje bil kör rakt fram tills den stöter i ett kvarter eller en
annan bils rutt, och alla bilar ska ut till en lastzon i sin egen färg innan dragen tar slut.

Varje ö spelas i tre nivåer med en, två och tre bilar. Nivåerna låses upp en i taget, och öarna kommer
i samma ordning för alla så att det går att jämföra hur långt man har kommit.

## Köra lokalt

```sh
npm start            # http://localhost:3000
```

Inga beroenden behöver installeras; servern använder bara Node (version 20 eller senare).

## Struktur

| Sökväg | Innehåll |
| --- | --- |
| `public/index.html`, `public/style.css` | Sidan och dess stil |
| `public/js/generator.js` | Labyrinter med Wave Function Collapse, spelregler, lösare och generering av öar |
| `public/js/city.js` | Grafiken: hav, kaj, gator, gräs, hus och bilar |
| `public/js/effects.js` | Animationer: ön byggs upp, bilar studsar fram, konfetti |
| `public/js/score.js` | Poäng, streak och topplista (sparas i webbläsaren) |
| `public/js/audio.js` | Bakgrundsmusik och ljudeffekter, som kan stängas av var för sig |
| `public/js/game.js` | Spelet: rendering, input, nivåer och sparad progress |
| `public/data/` | `tiles.json` (labyrintens tiles) och `puzzles.json` (färdiga öar) |
| `public/assets/` | Bildark för mark, kust, föremål och bilar (nedskalade) |
| `public/audio/` | Musik och ljudeffekter i AAC |
| `tools/` | Verktyg för att bygga tiles och öar; käll-tiles, originalbilder och originalljud |
| `server.js` | Liten statisk webbserver som används av Railway |

## Skapa öar

Öarna skapas i förväg eftersom varje ö tar några sekunder att ta fram och lösa.

```sh
npm run pregenerate -- 100   # skapar 100 nya öar (tar några minuter)
npm run sort-islands         # ordnar om befintliga öar utan att skapa nya
npm run build-tiles          # läser tools/tiles/*.png och skriver public/data/tiles.json
```

De första öarna följer en fast svårighetskurva (`OPENING` i `tools/pregenerate.cjs`); resten blandas
med ett fast frö så att ordningen är densamma för alla.

## Poäng

| Händelse | Poäng |
| --- | --- |
| Klarad nivå | samma som nivåns nummer (1, 2 eller 3) |
| Perfekt nivå (utan ångra, börja om eller slut på drag) | +1 |
| Het streak (tre eller fler perfekta nivåer i rad) | +1 per perfekt nivå |
| Klarad ö | +2 |

En runda avslutas och hamnar i topplistan om man hoppar över en ö innan den är klar.

## Publicering

Spelet publiceras på GitHub Pages: https://magnus-engstrom.github.io/bonway/

Flödet i `.github/workflows/pages.yml` publicerar mappen `public/` vid varje push till `main`. Spelet är
helt statiskt, så ingen server behövs där. `server.js` används för att köra lokalt och fungerar även på
till exempel Railway (`npm start`, som läser `PORT`).
