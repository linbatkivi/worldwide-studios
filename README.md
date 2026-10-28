# Worldwide (Studios)

Hjemmeside, launcher og konto-server for Worldwide (Studios) og understudiet (kivi studios).

| Del | Hvad | Mappe |
|---|---|---|
| Hjemmeside | Statisk side på GitHub Pages | [`site/`](site) |
| Launcher | Electron-app: login, installér og start spil | [`launcher/`](launcher) |
| Konto-server | Worldwide ID: konti, login og gemt fremgang pr. spil | [`api/`](api) |
| SDK | Klient til kontoen: JavaScript (web, Electron) og GDScript (Godot) | [`sdk/`](sdk) |
| Katalog | Listen over spil, med tekster, billeder og hvor de hentes | [`catalog/games.json`](catalog/games.json) |

Spillene ligger i hvert sit repo og er koblet på kontoen:

| Spil | Repo | Teknik | Hvordan det hentes |
|---|---|---|---|
| White Dust | [`white_dust`](https://github.com/linbatkivi/white_dust) | Node + browser, kører i launcheren | Filer fra spillets manifest, kun det der er ændret |
| Complex | `complex` (privat) | Godot 4.7 | Zip pr. platform på en release her i repoet |

Hjemmesiden: <https://linbatkivi.github.io/worldwide-studios/>

## Sådan hænger det sammen

```
 hjemmeside ──(download)──────────────┐
                                      ▼
                    ┌──────────  launcher  ──────────┐
                    │  login · installér · opdatér   │
                    └───┬───────────────┬────────────┘
        kontoen         │               │  starter spillet med et spil-token
   ┌────────────────────▼───┐     ┌─────▼──────────────────────┐
   │ Worldwide ID (api/)    │◄────┤ White Dust · Complex       │
   │ konti, sessioner,      │     │ navn og gemt fremgang      │
   │ gemt fremgang pr. spil │     └────────────────────────────┘
   └────────────────────────┘
```

1. Man opretter en konto i launcheren. Adgangskoden gemmes som scrypt-hash, aldrig i klartekst.
2. Launcheren gemmer sit login krypteret i systemets nøglering (macOS Keychain, Windows DPAPI, libsecret).
3. Trykker man *Spil*, bytter launcheren sit login til et **spil-token**. Det gælder kun det ene spil, kan kun
   læse navnet og gemme dét spils data, og ser aldrig e-mail eller adgangskode.
4. Spillet får tokenet med sig og henter sin fremgang, før det starter. Ændringer sendes tilbage, samlet og med
   revisionsnummer, så to computere ikke overskriver hinanden uden at blive fladet sammen.
5. Er man offline, kan man stadig spille. Fremgangen ligger lokalt og sendes, næste gang der er forbindelse.

## Kør det hele lokalt

Kræver Node 22.13 eller nyere.

```bash
npm install --prefix launcher
npm run dev
```

Det starter konto-serveren (`:8787`), hjemmesiden (`:8080`) og launcheren, som peger på dem og på spillenes
projektmapper (`~/Projekter/wd` og `~/Projekter/Complex/game`). Er spillene et andet sted:
`WD_DIR=… COMPLEX_DIR=… npm run dev`. Nulstillingskoder til adgangskoder skrives i terminalen.

Tests:

```bash
npm test
```

## Udgiv

**Hjemmesiden** og **kataloget**: push til `main`. [`pages.yml`](.github/workflows/pages.yml) lægger `site/` online og
kopierer kataloget med. Launcheren henter kataloget derfra, så nye tekster, billeder og spil-udgaver kommer ud
uden en ny launcher.

**Launcheren**: ret `version` i `launcher/package.json`, commit, og

```bash
git tag launcher-v1.0.1 && git push origin launcher-v1.0.1
```

[`launcher.yml`](.github/workflows/launcher.yml) bygger til Windows, macOS og Linux og lægger filerne på en release.
Download-knapperne på siden peger på `releases/latest/download/…`, så filnavnene må ikke ændres.
Windows og Linux opdaterer sig selv. Mac-appen er ikke signeret hos Apple, så der får brugeren en besked og et link, og macOS skal have lov første gang
(Systemindstillinger, Anonymitet og sikkerhed, Åbn alligevel).

**White Dust**: som før, i spillets eget repo: `node scripts/game-update.js --publish`. Launcheren og spillets egen app
læser det samme manifest.

**Complex**: `npm run publish:complex -- 0.2.0` bygger til alle tre platforme, lægger dem på en release og skriver
dem ind i kataloget.

**Konto-serveren**: kører på Fly.io (`https://worldwide-id.fly.dev`). Opdatér med `npm run deploy:api`, se [`api/README.md`](api/README.md).

## Nyt spil

1. Tilføj det i [`api/src/games.js`](api/src/games.js), så kontoen må gemme data for det.
2. Tilføj det i [`catalog/games.json`](catalog/games.json) med tekster, billeder (`npm run art`) og pakke.
3. Brug SDK'et i spillet: [`sdk/js/worldwide.js`](sdk/js/worldwide.js) eller [`sdk/godot/worldwide.gd`](sdk/godot/worldwide.gd).

## Mapper

```
api/        konto-server (Node, SQLite, ingen afhængigheder) + tests + Dockerfile + fly.toml
catalog/    games.json
launcher/   Electron-app
sdk/        js/worldwide.js, godot/worldwide.gd
site/       hjemmesiden
tools/      dev.js, publish-game.js, make-art.py, make-icons.js
```
