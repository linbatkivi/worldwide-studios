# Worldwide ID

Konto-serveren. Node 22.13+, ingen pakker at installere. Data ligger i én SQLite-fil.

```bash
npm start          # port 8787, databasen i ./data/worldwide.db
npm test           # 29 tests, bl.a. kontrakten med SDK'et
```

## Hvad den kan

| | |
|---|---|
| `POST /v1/register` · `/v1/login` · `/v1/logout` | Konto og sessioner. Et login gælder 60 dage fra sidste brug |
| `GET/PATCH/DELETE /v1/me` | Profil, skift navn, slet kontoen |
| `POST /v1/me/password` | Skift adgangskode. Alle andre enheder logges ud |
| `GET /v1/me/export` | Alt der er gemt om kontoen |
| `POST /v1/password/forgot` · `/reset` | Nulstilling med en kode på 6 cifre pr. mail (kræver mail, se nedenfor) |
| `POST /v1/game-token` | Launcheren bytter sit login til et token der kun gælder ét spil |
| `GET/PUT /v1/saves/:game` | Spillets gemte data (JSON, højst 256 KB) med revisionsnummer |

Spil-tokens kan hente navn og gemme data for det ene spil. De kan ikke se e-mail, ændre kontoen eller røre andre spil.

## Sikkerhed

- Adgangskoder: scrypt (2^15, r=8), unikt salt, sammenligning i konstant tid. Et login med ukendt e-mail tager lige lang tid som et med forkert kode.
- Tokens er 256 bit tilfældige. Databasen gemmer kun deres sha256, så et læk af filen giver ingen adgang.
- Begrænsninger pr. adresse og pr. e-mail på registrering, login (8 fejl pr. 15 min. pr. konto) og nulstilling. Nulstillingskoden dør efter 5 forkerte forsøg.
- Forespørgsler har en størrelsesgrænse, JSON valideres, og alle SQL-kald bruger parametre.
- Der logges ikke e-mails, adgangskoder eller tokens.

## Kør online (Fly.io)

```bash
cd api
fly auth login                                    # første gang. Fly kræver et betalingskort på kontoen
fly apps create worldwide-id                      # navnet skal være unikt, ret det i fly.toml hvis det er taget
fly volumes create worldwide_data --region arn --size 1
fly deploy
```

Peger kataloget (`catalog/games.json`, feltet `api`) på en anden adresse end `https://worldwide-id.fly.dev`, så ret det der.

Nulstilling af adgangskode pr. mail slås til ved at sætte en nøgle fra [Resend](https://resend.com) og en verificeret afsender:

```bash
fly secrets set RESEND_API_KEY=… MAIL_FROM="Worldwide (Studios) <konto@dit-domæne.dk>"
```

Uden nøglen er funktionen slået fra, og launcheren viser ikke linket *Glemt adgangskode*.

Alle indstillinger står i [`.env.example`](.env.example). Databasen tages med i Flys daglige volumen-snapshots.
