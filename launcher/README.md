# Launcher

Electron-app til Worldwide (Studios): log ind, installér spillene, hold dem opdateret og start dem.

```bash
npm install
npm start            # kopierer SDK og katalog ind (npm run sync) og starter appen
npm test             # installation, manifest, sikkerhed
npm run pack         # uden installer, til at prøve den pakkede app
npm run dist:mac     # eller dist:win, dist:linux
```

Udviklingsværktøjer og miljøvariabler:

| | |
|---|---|
| `WW_API=http://127.0.0.1:8787` | peg launcheren på en lokal konto-server |
| `WW_USERDATA=/sti` | helt ren kopi af appens data (en ekstra spiller på samme maskine) |
| `WW_PROFILE=b` | ekstra kopi ved siden af den almindelige |
| `WW_DEVTOOLS=1` | Ctrl/Cmd+Shift+I åbner udviklerværktøjerne |
| Indstillinger, Udvikler | kør spillene direkte fra dine projektmapper |

## Hvordan det er bygget

```
src/main.js            vindue, IPC, opstart
src/preload.js         det eneste vinduet kan kalde (contextBridge)
src/lib/auth.js        login, sessioner, spil-tokens (tokenet forlader aldrig hovedprocessen)
src/lib/secure.js      krypteret opbevaring af login (Windows, Linux) eller en fil kun brugeren kan læse (macOS)
src/lib/catalog.js     katalog fra hjemmesiden, med sidst hentede og medfølgende som reserve
src/lib/games.js       status, installation, opdatering og start
src/lib/installer-web.js     manifest-spil (White Dust): henter kun det der er ændret, tjekker sha256
src/lib/installer-native.js  zip pr. platform (Complex): tjekker sha256, pakker ud
src/lib/runtime-white-dust.js  kører White Dust inde i launcheren, med spillets egen server og peer-to-peer
src/renderer/          brugerfladen (almindelig HTML, CSS og JS)
```

Et nyt spil kræver en post i `catalog/games.json`. Et spil bygget på samme måde som White Dust bruger
`web-manifest`, alt andet er `native` (et zip pr. platform).

macOS-appen er ikke signeret hos Apple. Det betyder, at macOS blokerer den første gang (Systemindstillinger, Anonymitet og sikkerhed, Åbn alligevel), og at
opdateringer hentes af launcheren selv (`src/lib/mac-update.js`) i stedet for electron-updater. Windows og Linux bruger electron-updater.
