- Spelet ska bestå av en labyrint som genereras via Wave Function Collapse-algoritmen. Det finns tiles i tiles som borde läsas in till någon form av dataobjekt. Vita pixlar är öppna ytor, svarta pixlar är hinder/väggar.

- Runt spelet ska det finnas en ram av väggar med öppningar i.

- I varje öppning finns det en färgad yta som representerar en linjefärg.

- Om jag klickar på en sådan öppning ska jag få val att dra linjen i en rak riktning till närmsta punkt där linjen bryts av ett hinder.

- Målet är att dra linjen fram till ett mål som består av samma färg.

- Det ska finnas flera färger/linjer som inte får korsas. Målet är alltså att dra alla linjer.

- Det ska finnas ett begränsat antal drag som spelaren kan göra. Vi kanske kan använda A* för att ta fram lösningen.

- Varje spelplan ska alltså uppfylla dessa krav:
1. Det ska finnas öppningar i kanterna och från de öppningarna ska det gå att nå målet för varje linje.
2. Det ska gå att spela med en, två och tre linjer.
3. Det måste gå att klara spelet med ett givet antal drag (antalet räknas ut dynamiskt)