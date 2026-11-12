# Billeder og tekst i launcheren

Hver gang et spil udgives til launcheren, skal billederne og teksten i `catalog/games.json` gennemgås og ændres, så de passer til spillet som det er nu. `node tools/publish-game.js <spil> <version>` stopper, hvis det ikke er sket. Det samme gælder White Dust (`scripts/game-update.js --publish`) og Flugt, som følger launcheren: kør `node tools/content-check.js <spil> <version>` først.

## Arbejdsgang ved en udgivelse

1. Start spillet og tag nye billeder (se nedenfor). Læg de færdige filer i `tools/art-src/` og tilføj dem i `tools/make-art.py`, kør `python3 tools/make-art.py`.
2. Peg `art.hero`, `art.card` og `art.shots` i kataloget på de nye filer. Brug nye filnavne, når et billede skiftes (fx `hero3.webp`), ellers viser launcheren det gamle fra sin cache.
3. Læs `tagline`, `description` og `facts` igen. Står der noget, der ikke længere passer, eller mangler noget nyt spillet kan, så ret det. Både dansk og engelsk.
4. `node tools/content-check.js <spil> <version>` tjekker reglerne og stempler indholdet til versionen. Har spillet ikke ændret sig synligt, kræver stemplet `--same`.
5. Udgiv (publish-game.js lægger også kataloget og billederne ud på hjemmesiden med tools/deploy-site.sh; ved White Dust og Flugt kør den selv). Commit kun egne filer, andre sessions redigerer samtidig.

## Billeder

- Filmiske, professionelle billeder taget direkte i spillet. Ingen skærmtekst, menuer, HUD, skærmbilleder af indstillinger eller fejlmeddelelser. Spilleren ser spillet, ikke grænsefladen.
- 16:9, hero mindst 1920 bred, skærmbilleder mindst 1280 bred. Mindst fire skærmbilleder ud over hero, alle forskellige.
- Komponér som et fotografi: tydeligt motiv, dybde (forgrund, mellemgrund, baggrund), lavt eller kraftigt sidelys, ingen ensartede grå flader. Flyt kameraet. Et standardkamera på spillerens øjenhøjde er sjældent det bedste billede.
- Hvert billede skal vise noget forskelligt: bane, situation, tidspunkt, vejr, vinkel. Fire næsten ens billeder tæller som ét.
- Hero er spillets stærkeste billede og skal virke som forside uden tekst på.
- Ingen forvrængning fra vidvinkel. Hold synsfeltet naturligt, 60 til 75 grader.
- Tag billederne fra den version, der udgives nu. Gamle billeder af en forældet grafik er forkerte.
- Spilkode til billedtagning (kamera, skjult HUD, fast tidspunkt) hører til i spillets eget repo, ikke her.

## Tekst

- Dansk først, så engelsk med samme indhold. Kort og konkret. Skriv det, der kan læses i spillets kode, ikke det du synes lyder godt.
- `tagline`: én sætning, højst 95 tegn. `description`: 180 til 650 tegn. `facts`: 3 til 5 linjer, kun fakta (antal spillere, baner, styring, online).
- Beskriv, hvad man gør og hvordan det virker. Ikke hvordan det føles.
- Ingen reklamesprog (oplev, udforsk, episk, intens, adrenalin, fantastisk, spændende), ingen tankestreger, ingen udråbstegn, ingen «ikke bare X, men Y», ingen tre-leddede opremsninger for rytmens skyld, ingen påstande om at spillet er «unikt» eller «det bedste».
- Skriv ikke om funktioner, der ikke findes endnu. Står spillet som `in-development`, så skriv hvad der virker nu.
- Læs teksten højt. Hvis en sætning lyder som en reklame eller en AI, så skriv den om med de rigtige tal og navne i stedet.

`tools/content-check.js` fanger de mekaniske fejl (størrelse, format, forbudte ord og tegn). Resten er dit ansvar.
